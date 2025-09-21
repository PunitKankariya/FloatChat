import os
import pandas as pd
from utils.load_config import LoadConfig
import google.generativeai as genai


class PrepareVectorDBFromTabularData:
    """
    This class is designed to prepare a vector database from a CSV and XLSX file.
    It then loads the data into a ChromaDB collection. The process involves
    reading the CSV file, generating embeddings using Google Gemini API, and storing 
    the data in the specified collection.
    
    Attributes:
        APPCFG: Configuration object containing settings and client instances for database and embedding generation.
        file_directory: Path to the CSV file that contains data to be uploaded.
    """
    def __init__(self, file_directory: str) -> None:
        """
        Initialize the instance with the file directory and load the app config.
        
        Args:
            file_directory (str): The directory path of the file to be processed.
        """
        self.APPCFG = LoadConfig()
        self.file_directory = file_directory
        
        # Configure Google Gemini API
        # Try different common names for the API key
        api_key = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY') or os.getenv('GOOGLE_AI_API_KEY')
        
        if not api_key:
            raise ValueError("Gemini API key not found. Please set GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_AI_API_KEY in your .env file")
        
        genai.configure(api_key=api_key)
        
        
    def test_gemini_connection(self):
        """
        Test the Gemini API connection with a simple embedding request.
        """
        try:
            print("Testing Gemini API connection...")
            test_response = genai.embed_content(
                model="models/text-embedding-004",
                content="This is a test string",
                task_type="retrieval_document"
            )
            print("✓ Gemini API connection successful")
            print(f"✓ Embedding dimension: {len(test_response['embedding'])}")
            return True
        except Exception as e:
            print(f"✗ Gemini API connection failed: {str(e)}")
            print(f"✗ Error type: {type(e).__name__}")
            return False
    
    def run_pipeline(self):
        """
        Execute the entire pipeline for preparing the database from the CSV.
        This includes loading the data, preparing the data for injection, injecting
        the data into ChromaDB, and validating the existence of the injected data.
        """
        # Test API connection first
        if not self.test_gemini_connection():
            print("Stopping pipeline due to API connection issues.")
            return
            
        self.df, self.file_name = self._load_dataframe(file_directory=self.file_directory)
        print(f"Loaded DataFrame with shape: {self.df.shape}")
        
        # Show first few rows for debugging
        print("First 2 rows of data:")
        print(self.df.head(2))
        
        self.docs, self.metadatas, self.ids, self.embeddings = self._prepare_data_for_injection(df=self.df, file_name=self.file_name)
        
        if not self.embeddings:
            print("No embeddings generated. Stopping pipeline.")
            return
            
        self._inject_data_into_chromadb()
        self._validate_db()

    def _inject_data_into_chromadb(self):
        """
        Inject the prepared data into ChromaDB.
        
        Deletes any existing collection and creates a new one with the correct
        embedding dimensions.
        """
        # Delete the collection if it exists
        try:
            self.APPCFG.chroma_client.delete_collection(name=self.APPCFG.collection_name)
            print(f"Deleted existing collection: {self.APPCFG.collection_name}")
        except Exception as e:
            print(f"No existing collection to delete or error deleting: {str(e)}")
        
        # Get the embedding dimension from the first embedding
        if not self.embeddings:
            raise ValueError("No embeddings available to determine dimension")
        
        embedding_dimension = len(self.embeddings[0])
        print(f"Using embedding dimension: {embedding_dimension}")
        
        # Create a new collection with the correct embedding function
        collection = self.APPCFG.chroma_client.create_collection(
            name=self.APPCFG.collection_name,
            embedding_function=self.APPCFG.embedding_function,
            metadata={"embedding_dimension": embedding_dimension}
        )
        
        # Add the documents with their embeddings
        collection.add(
            documents=self.docs,
            metadatas=self.metadatas,
            embeddings=self.embeddings,
            ids=self.ids
        )
        
        print("=" * 50)
        print(f"Successfully stored {len(self.embeddings)} documents in ChromaDB")
        print(f"Collection: {self.APPCFG.collection_name}")
        print(f"Embedding dimension: {embedding_dimension}")
        print("=" * 50)
    
    def _load_dataframe(self, file_directory: str):
        """
        Load a DataFrame from the specified CSV or Excel file.
        
        Args:
            file_directory (str): The directory path of the file to be loaded.
            
        Returns:
            DataFrame, str: The loaded DataFrame and the file's base name without the extension.
            
        Raises:
            ValueError: If the file extension is neither CSV nor Excel.
        """
        print(f"Debug: Loading file from: {file_directory}")
        
        # Check if it's a directory or file
        if os.path.isdir(file_directory):
            # If it's a directory, look for CSV and Excel files
            files = []
            for ext in ['.csv', '.xlsx', '.xls']:
                files.extend([f for f in os.listdir(file_directory) if f.lower().endswith(ext)])
            
            if not files:
                raise ValueError(f"No CSV or Excel files found in directory: {file_directory}")
            
            # Take the first file found
            file_path = os.path.join(file_directory, files[0])
            print(f"Debug: Found file: {files[0]}")
        else:
            file_path = file_directory
        
        file_names_with_extensions = os.path.basename(file_path)
        print(f"Debug: Processing file: {file_names_with_extensions}")
        
        file_name, file_extension = os.path.splitext(file_names_with_extensions)
        file_extension = file_extension.lower()  # Make case-insensitive
        
        print(f"Debug: File name: {file_name}, Extension: {file_extension}")
        
        if file_extension == ".csv":
            df = pd.read_csv(file_path)
            return df, file_name
        elif file_extension in [".xlsx", ".xls"]:
            df = pd.read_excel(file_path)
            return df, file_name
        else:
            raise ValueError(f"The selected file type '{file_extension}' is not supported. Supported types: .csv, .xlsx, .xls")
        

    def _prepare_data_for_injection(self, df: pd.DataFrame, file_name: str):
        """
        Generate embeddings using Google Gemini API and prepare documents for data injection.
        
        Args:
            df (pd.DataFrame): The DataFrame containing the data to be processed.
            file_name (str): The base name of the file for use in metadata.
            
        Returns:
            list, list, list, list: Lists containing documents, metadatas, ids, and embeddings respectively.
        """
        docs = []
        metadatas = []
        ids = []
        embeddings = []
        
        print(f"Processing {len(df)} rows...")
        
        for index, row in df.iterrows():
            print(f"Processing row {index + 1}/{len(df)}")
            
            output_str = ""
            # Treat each row as a separate chunk
            for col in df.columns:
                # Handle NaN values and convert to string safely
                value = row[col]
                if pd.isna(value):
                    value = "N/A"
                output_str += f"{col}: {str(value)},\n"
            
            # Truncate very long strings to avoid API limits
            if len(output_str) > 8000:  # Gemini has token limits
                output_str = output_str[:8000] + "..."
                print(f"Warning: Truncated long text for row {index}")
            
            try:
                print(f"Generating embedding for row {index}...")
                
                # Test with a simple model first
                response = genai.embed_content(
                    model="models/text-embedding-004",  # Use specific model
                    content=output_str,
                    task_type="retrieval_document"
                )
                
                print(f"Embedding generated successfully for row {index}")
                
                embeddings.append(response['embedding'])
                docs.append(output_str)
                metadatas.append({"source": file_name, "row_index": index})
                ids.append(f"id{index}")
                
                # Add a small delay to avoid rate limiting
                import time
                time.sleep(0.1)
                
            except Exception as e:
                print(f"Error generating embedding for row {index}: {str(e)}")
                print(f"Error type: {type(e).__name__}")
                # Skip this row and continue
                continue
                
        print(f"Successfully processed {len(embeddings)} out of {len(df)} rows")
        return docs, metadatas, ids, embeddings
        

    def _validate_db(self):
        """
        Validate the contents of the database to ensure that the data injection has been successful.
        Prints the number of vectors in the ChromaDB collection for confirmation.
        """
        vectordb = self.APPCFG.chroma_client.get_collection(name=self.APPCFG.collection_name)
        print("==============================")
        print("Number of vectors in vectordb:", vectordb.count())
        print("==============================")


# Additional utility function for batch processing (optional)
def batch_embed_content(texts, model_name, batch_size=100):
    """
    Process embeddings in batches to handle rate limits more efficiently.
    
    Args:
        texts (list): List of texts to embed
        model_name (str): Gemini embedding model name
        batch_size (int): Number of texts to process in each batch
        
    Returns:
        list: List of embeddings
    """
    all_embeddings = []
    
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        batch_embeddings = []
        
        for text in batch_texts:
            try:
                response = genai.embed_content(
                    model=model_name,
                    content=text,
                    task_type="retrieval_document"
                )
                batch_embeddings.append(response['embedding'])
            except Exception as e:
                print(f"Error in batch processing: {str(e)}")
                # Add a zero vector or skip based on your requirements
                batch_embeddings.append([0] * 384)  # Adjust dimension as needed
                
        all_embeddings.extend(batch_embeddings)
        
    return all_embeddings