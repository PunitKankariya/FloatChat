from utils.prepare_vectordb_from_csv_xlsx import PrepareVectorDBFromTabularData
from utils.load_config import LoadConfig

APPCFG = LoadConfig()

if __name__=="__main__":
    from pyprojroot import here
    # Specify the path to your CSV file directory below
    titanic_dir = here("data/for_upload/titanic_small.csv")
    # Create an instance of the PrepareVectorDBFromTabularData class with the file directory
    data_prep_instance = PrepareVectorDBFromTabularData(APPCFG.stored_csv_xlsx_directory)
    # Run the pipeline to prepare and inject the data into the vector database
    data_prep_instance.run_pipeline()
