import os
from dotenv import load_dotenv
import yaml
from pyprojroot import here
import shutil
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
import google.generativeai as genai
import chromadb

print("Environment variables are loaded:", load_dotenv())


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
        self.model_name = "gemini-1.5-flash"  # hardcoded or pull from YAML if needed
        self.agent_llm_system_role = app_config["llm_config"]["agent_llm_system_role"]
        self.rag_llm_system_role = app_config["llm_config"]["rag_llm_system_role"]
        self.temperature = app_config["llm_config"]["temperature"]
        self.embedding_model_name = "models/embedding-001"

    def load_gemini_models(self):
        # Configure the Google Generative AI client
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        
        # Create the direct Gemini client for chat completions
        self.gemini_client = genai.GenerativeModel(self.model_name)
        
        # LangChain LLM for SQL agent
        self.langchain_llm = ChatGoogleGenerativeAI(
            model=self.model_name,
            google_api_key=os.getenv("GOOGLE_API_KEY"),
            temperature=self.temperature
        )
        
        # Embedding model
        self.embedding_model = GoogleGenerativeAIEmbeddings(
            model=self.embedding_model_name,
            google_api_key=os.getenv("GOOGLE_API_KEY")
        )

    def load_chroma_client(self):
        self.chroma_client = chromadb.PersistentClient(
            path=str(here(self.persist_directory)))

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

            