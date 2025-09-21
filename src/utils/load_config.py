import os
import yaml
from pyprojroot import here
import shutil
from dotenv import load_dotenv
import warnings

# Suppress deprecation warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

# Load environment variables from .env file
load_dotenv()

def get_google_api_key():
    """Get Google API key from environment variables"""
    api_key = os.getenv("GOOGLE_API_KEY")
    return api_key

# import chromadb  # Moved to load_chroma_client method to avoid onnxruntime issues


class LoadConfig:
    def __init__(self) -> None:
        with open(here("configs/app_config.yml")) as cfg:
            app_config = yaml.load(cfg, Loader=yaml.FullLoader)

        self.load_directories(app_config=app_config)
        self.load_llm_configs(app_config=app_config)
        self.load_gemini_models()
        self.load_chroma_client()
        self.load_rag_config(app_config=app_config)

        # Optional: clean up old files
        # self.remove_directory(self.uploaded_files_sqldb_directory)

    def load_directories(self, app_config):
        self.stored_csv_xlsx_directory = here(
            app_config["directories"]["stored_csv_xlsx_directory"])
        self.sqldb_directory = str(here(
            app_config["directories"]["sqldb_directory"]))
        self.uploaded_files_sqldb_directory = str(here(
            app_config["directories"]["uploaded_files_sqldb_directory"]))
        self.stored_csv_xlsx_sqldb_directory = str(here(
            app_config["directories"]["stored_csv_xlsx_sqldb_directory"]))
        self.persist_directory = app_config["directories"]["persist_directory"]

    def load_llm_configs(self, app_config):
        llm_config = app_config["llm_config"]
        self.model_name = llm_config.get("engine", "gemini-1.5-flash")
        self.agent_llm_system_role = llm_config["agent_llm_system_role"]
        self.rag_llm_system_role = llm_config["rag_llm_system_role"]
        self.temperature = llm_config["temperature"]

        # Correctly handle embedding model configuration
        self.use_local_embeddings = llm_config.get("use_local_embeddings", False)
        self.use_google_genai = llm_config.get("google_generative_ai_enabled", False) and not self.use_local_embeddings

        if self.use_local_embeddings:
            self.embedding_model_name = llm_config.get("local_embedding_model", "sentence-transformers/all-MiniLM-L6-v2")
        else:
            self.embedding_model_name = "models/embedding-001"

    def load_gemini_models(self):
        # Initialize all to None by default
        self.gemini_client = None
        self.langchain_llm = None
        self.embedding_model = None
        self.embedding_fallback = None

        # Configure batch size and retries from config
        self.batch_size = getattr(self, 'batch_size', 10)
        self.max_retries = getattr(self, 'max_retries', 3)
        self.request_delay = getattr(self, 'request_delay', 1.0)

        # Always set up local embeddings as fallback
        self._setup_local_embeddings()
        self.embedding_fallback = self.embedding_model

        # 1) Try Google GenAI if enabled in config
        if getattr(self, "use_google_genai", False):
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings  # type: ignore
                import google.generativeai as genai  # type: ignore
                import time
                from tenacity import retry, stop_after_attempt, wait_exponential

                api_key = get_google_api_key()
                if not api_key:
                    print("[LoadConfig] GOOGLE_API_KEY not set; using local embeddings")
                    return

                # Configure Google client with retry logic
                @retry(
                    stop=stop_after_attempt(self.max_retries),
                    wait=wait_exponential(multiplier=1, min=4, max=10)
                )
                def configure_google():
                    genai.configure(api_key=api_key)
                    return genai.GenerativeModel(self.model_name)

                # Initialize Google clients with retry
                try:
                    # Gemini client for direct use (optional)
                    self.gemini_client = configure_google()
                    
                    # LangChain LLM with Gemini
                    self.langchain_llm = ChatGoogleGenerativeAI(
                        model=self.model_name,
                        google_api_key=api_key,
                        temperature=self.temperature,
                    )
                    
                    # Google Embeddings with rate limiting
                    self.embedding_model = GoogleGenerativeAIEmbeddings(
                        model="models/embedding-001",
                        google_api_key=api_key,
                        # Add rate limiting parameters
                        request_options={
                            'timeout': 30.0,  # 30 second timeout
                            'retry': {
                                'initial_delay': 1.0,
                                'maximum_delay': 10.0,
                                'multiplier': 1.5,
                                'total_timeout': 300.0,  # 5 minutes total timeout
                                'predicate': 'retryable',
                            }
                        }
                    )
                    
                    print("[LoadConfig] Successfully initialized Google GenAI with rate limiting")
                    
                except Exception as e:
                    print(f"[LoadConfig] Google GenAI initialization failed: {e}")
                    if self.embedding_fallback:
                        print("[LoadConfig] Falling back to local embeddings")
                        self.embedding_model = self.embedding_fallback
                    raise

            except Exception as e:
                print(f"[LoadConfig] Google GenAI setup failed, using fallback: {e}")
                if self.embedding_fallback:
                    self.embedding_model = self.embedding_fallback

        # 2) If Google is not enabled/available, prefer OpenAI if API key present
        try:
            openai_api_key = os.getenv("OPENAI_API_KEY")
            if openai_api_key:
                from langchain_openai import ChatOpenAI  # type: ignore
                openai_model = self.model_name if self.model_name.startswith("gpt-") else "gpt-3.5-turbo"
                self.langchain_llm = ChatOpenAI(model=openai_model, temperature=self.temperature, api_key=openai_api_key)
                # Local embeddings for non-Google path
                self._setup_local_embeddings()
                return
        except Exception as e:
            print(f"[LoadConfig] OpenAI LLM setup skipped: {e}")

        # 3) Fallback to local embeddings only
        self._setup_local_embeddings()

    def _setup_local_embeddings(self):
        """Set up local sentence-transformers embeddings as fallback"""
        try:
            # Use the updated import for HuggingFaceEmbeddings
            from langchain_huggingface import HuggingFaceEmbeddings
            
            # Use a default local model if not specified or if it's a Google model
            local_model_name = getattr(self, 'local_embedding_model', 'sentence-transformers/all-MiniLM-L6-v2')
            if 'embedding-001' in str(local_model_name):
                local_model_name = 'sentence-transformers/all-MiniLM-L6-v2'
                
            print(f"[LoadConfig] Initializing local embeddings with model: {local_model_name}")
            
            self.embedding_model = HuggingFaceEmbeddings(
                model_name=local_model_name,
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True}
            )
        except ImportError as e:
            print(f"[Error] Failed to initialize local embeddings: {e}")
            print("Please install the required packages:")
            print("pip install -U langchain-huggingface sentence-transformers")
            self.embedding_model = None

    def load_chroma_client(self):
        """Initialize the ChromaDB client and set up the embedding function."""
        import chromadb
        from chromadb.utils import embedding_functions
        import numpy as np
        
        # Initialize the client
        self.chroma_client = chromadb.PersistentClient(
            path=str(here(self.persist_directory))
        )
        
        # Set up the embedding function based on configuration
        try:
            if getattr(self, "use_local_embeddings", True):
                # Use local sentence-transformers embeddings
                self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name=getattr(self, "embedding_model_name", "all-MiniLM-L6-v2"),
                    device="cpu",
                    normalize_embeddings=True
                )
                self.embedding_dimension = 384  # all-MiniLM-L6-v2 uses 384 dimensions
                print(f"Using local embeddings with dimension: {self.embedding_dimension}")
                
            elif getattr(self, "use_google_genai", False) and hasattr(self, "embedding_model"):
                # Create a wrapper function for Google's embedding model
                def google_embedding_function(texts):
                    if isinstance(texts, str):
                        texts = [texts]
                    # Get embeddings from the model
                    if hasattr(self.embedding_model, 'embed_documents'):
                        embeddings = self.embedding_model.embed_documents(texts)
                    else:
                        embeddings = [self.embedding_model.embed_query(text) for text in texts]
                    # Ensure the output is in the expected format
                    if isinstance(embeddings, list) and len(embeddings) > 0:
                        if isinstance(embeddings[0], (list, np.ndarray)):
                            return embeddings
                        return [embeddings]  # Wrap single embedding in a list
                    return embeddings
                
                self.embedding_function = google_embedding_function
                self.embedding_dimension = 768  # Google's text-embedding-004 uses 768 dimensions
                print(f"Using Google embeddings with dimension: {self.embedding_dimension}")
                
            else:
                # Fall back to default local embeddings
                self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name="all-MiniLM-L6-v2",
                    device="cpu",
                    normalize_embeddings=True
                )
                self.embedding_dimension = 384
                print(f"Using default local embeddings with dimension: {self.embedding_dimension}")
                
        except Exception as e:
            print(f"Warning: Could not set up embedding function: {e}")
            self.embedding_function = None
            self.embedding_dimension = None
            print("Warning: No embedding function available. Some features may not work.")

    def load_rag_config(self, app_config):
        self.collection_name = app_config["rag_config"]["collection_name"]
        self.top_k = app_config["rag_config"]["top_k"]

    def remove_directory(self, directory_path: str):
        """
        Removes the specified directory.

        Parameters:
            directory_path (str): The path of the directory to be removed.

        Raises:
            OSError: If an error occurs during the directory removal process.

        Returns:
            None
        """
        if os.path.exists(directory_path):
            try:
                shutil.rmtree(directory_path)
                print(f"The directory '{directory_path}' has been successfully removed.")
            except OSError as e:
                print(f"Error: {e}")
        else:
            print(f"The directory '{directory_path}' does not exist.")

            