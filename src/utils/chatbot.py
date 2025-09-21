import os
import io
import base64
from typing import List, Tuple, Dict, Any, Optional
from utils.load_config import LoadConfig
from langchain_community.utilities import SQLDatabase
from langchain.chains import create_sql_query_chain
from langchain_community.tools.sql_database.tool import QuerySQLDataBaseTool
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from operator import itemgetter
from sqlalchemy import create_engine, text
from langchain_community.agent_toolkits import create_sql_agent
from datetime import datetime, timedelta
from utils.graph_generator import SQLGraphAgent
import pandas as pd

import langchain
langchain.debug = False

APPCFG = LoadConfig()

# Simple in-memory cooldown to avoid spamming LLM when Google returns 429 quota
_LLM_COOLDOWN_UNTIL: datetime | None = None

def _llm_available() -> bool:
    global _LLM_COOLDOWN_UNTIL
    if _LLM_COOLDOWN_UNTIL is None:
        return True
    return datetime.utcnow() >= _LLM_COOLDOWN_UNTIL

def _activate_llm_cooldown(minutes: int = 10):
    global _LLM_COOLDOWN_UNTIL
    _LLM_COOLDOWN_UNTIL = datetime.utcnow() + timedelta(minutes=minutes)


class ChatBot:
    """
    A ChatBot class capable of responding to messages using different modes of operation.
    It can interact with SQL databases, leverage language chain agents for Q&A,
    and use embeddings for Retrieval-Augmented Generation (RAG) with ChromaDB.
    """
    
    def __init__(self):
        """Initialize the ChatBot with optional graph agent."""
        self.graph_agent = SQLGraphAgent(self)  # Initialize graph agent
        
    def _get_sql_response(self, message: str, chat_type: str) -> str:
        """
        Get the SQL response for a given message and chat type.
        
        Args:
            message: The user's message
            chat_type: Type of chat (e.g., "Q&A with stored SQL-DB")
            
        Returns:
            str: The SQL query response as a string
        """
        try:
            if chat_type == "Q&A with stored SQL-DB":
                if os.path.exists(APPCFG.sqldb_directory):
                    # Use direct SQL query to get the response
                    import sqlite3
                    conn = sqlite3.connect(APPCFG.sqldb_directory)
                    cursor = conn.cursor()
                    
                    # Get the first table
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1;")
                    table_name = cursor.fetchone()[0]
                    
                    # Simple query to get data (customize based on your needs)
                    query = f"SELECT * FROM {table_name} LIMIT 5"
                    cursor.execute(query)
                    results = cursor.fetchall()
                    
                    # Format the results as a string
                    if results:
                        columns = [desc[0] for desc in cursor.description]
                        response = "\n".join([str(dict(zip(columns, row))) for row in results])
                        return f"Query results:\n{response}"
                    
                    conn.close()
            
            return "No data found."
            
        except Exception as e:
            print(f"Error getting SQL response: {e}")
            return f"Error retrieving data: {str(e)}"
            
    def _prepare_response_with_visualization(self, message: str, response: str) -> dict:
        """
        Prepare the response data dictionary with optional visualization.
        
        Args:
            message: The user's message
            response: The text response to include
            
        Returns:
            dict: Response data with text and optional visualization
        """
        response_data = {"text": response}
        
        # Check if this is a graph-related query
        if hasattr(self, 'graph_agent') and self.graph_agent is not None and self.graph_agent.detect_graph_request(message):
            try:
                # Get the database path based on the current configuration
                db_path = getattr(APPCFG, 'sqldb_directory', None)
                if not db_path or not os.path.exists(db_path):
                    return response_data
                
                # Get the first table in the database
                engine = create_engine(f"sqlite:///{db_path}")
                with engine.connect() as conn:
                    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1;"))
                    tables = result.fetchall()
                    
                    if tables:
                        table_name = tables[0][0]
                        # Get sample data for visualization
                        result_df = self.execute_query(f"SELECT * FROM {table_name} LIMIT 1000", db_path)
                        
                        if not result_df.empty:
                            # Generate the visualization
                            chart_type = self.graph_agent.determine_chart_type(message, result_df)
                            plt = self.graph_agent.generate_graph(result_df, chart_type, message)
                            
                            # Convert plot to base64 for the response
                            buf = io.BytesIO()
                            plt.savefig(buf, format='png')
                            plt.close()
                            buf.seek(0)
                            img_str = base64.b64encode(buf.read()).decode('utf-8')
                            
                            # Add image to response
                            response_data['graph'] = f"data:image/png;base64,{img_str}"
                            
            except Exception as e:
                print(f"Error in _prepare_response_with_visualization: {e}")
                # If there's an error, just return the text response without visualization
                
        return response_data
        
    def execute_query(self, query: str, db_path: str = None) -> pd.DataFrame:
        """Execute a SQL query and return results as a DataFrame."""
        if db_path is None:
            db_path = APPCFG.sqldb_directory
            
        engine = create_engine(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            try:
                result = conn.execute(text(query))
                columns = result.keys()
                data = result.fetchall()
                return pd.DataFrame(data, columns=columns)
            except Exception as e:
                print(f"Error executing query: {e}")
                return pd.DataFrame()

    def respond(self, chatbot: List, message: str, chat_type: str, app_functionality: str) -> Tuple[str, List, Optional[Dict]]:
        """
        Process a user message and generate a response.
        
        Args:
            chatbot: The chat history
            message: User's message
            chat_type: Type of chat (e.g., "Q&A with stored SQL-DB")
            app_functionality: The app functionality being used (e.g., "Chat")
            
        Returns:
            Tuple containing:
                - Empty string (legacy return value)
                - Updated chat history
                - Response data dictionary with text
        """
        try:
            # Initialize response data with default values
            response_data = {
                "response": "",
                "success": False,
                "error": None
            }
            
            # Process based on chat type
            if chat_type == "Q&A with stored SQL-DB":
                response = self._get_sql_response(message, chat_type)
                response_data["response"] = response
                response_data["success"] = True
                response_data["text"] = response  # Ensure 'text' field is set for backward compatibility
                
                # Check if we should add visualization
                if hasattr(self, 'graph_agent') and self.graph_agent is not None:
                    try:
                        response_data = self._prepare_response_with_visualization(message, response)
                    except Exception as e:
                        print(f"Warning: Failed to generate visualization: {str(e)}")
                        # Continue without visualization if it fails
                
                # Ensure we always return a valid response
                if not response_data.get("response"):
                    response_data["response"] = response
                
                return "", chatbot + [[message, response_data["response"]]], response_data
                
            elif chat_type == "RAG with stored CSV/XLSX ChromaDB":
                try:
                    # Initialize RAG response
                    response = "Response from RAG model"
                    response_data = {"response": response, "success": True, "text": response}
                    
                    # Check if we have a graph agent and this is a visualization request
                    if hasattr(self, 'graph_agent') and self.graph_agent is not None:
                        try:
                            # Get the database path from config
                            db_path = getattr(APPCFG, 'sqldb_directory', None)
                            if db_path and os.path.exists(db_path):
                                # Get the first table name
                                engine = create_engine(f"sqlite:///{db_path}")
                                with engine.connect() as conn:
                                    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1;"))
                                    tables = result.fetchall()
                                    
                                    if tables:
                                        table_name = tables[0][0]
                                        # Get sample data for visualization
                                        result_df = self.execute_query(f"SELECT * FROM {table_name} LIMIT 1000", db_path)
                                        
                                        if not result_df.empty:
                                            # Generate the visualization
                                            chart_type = self.graph_agent.determine_chart_type(message, result_df)
                                            graph_data = self.graph_agent.generate_graph(result_df, chart_type, message)
                                            
                                            # Update response with graph data
                                            response_data.update({
                                                "response": f"{response}\n\nHere's a visualization of the data:",
                                                "graph": f"data:image/png;base64,{graph_data['data']}",
                                                "graph_data": {
                                                    "type": "image",
                                                    "format": "image/png"
                                                }
                                            })
                        except Exception as e:
                            print(f"Warning: Failed to generate visualization: {str(e)}")
                    
                    return "", chatbot + [[message, response_data["response"]]], response_data
                    
                except Exception as e:
                    error_msg = str(e)
                    print(f"Error in RAG processing: {error_msg}")
                    
                    # Check for specific error types
                    if "quota" in error_msg.lower() or "429" in error_msg:
                        user_friendly_msg = "We've hit the API rate limit. Please try again in about an hour or check your API quota."
                    elif "connection" in error_msg.lower():
                        user_friendly_msg = "Unable to connect to the AI service. Please check your internet connection."
                    else:
                        user_friendly_msg = f"An error occurred: {error_msg}"
                    
                    return "", chatbot + [[message, user_friendly_msg]], {
                        "response": user_friendly_msg, 
                        "success": False, 
                        "error": error_msg
                    }
            
            if app_functionality == "Chat":
                # --- Case 1: Q&A with stored SQL-DB ---
                if chat_type == "Q&A with stored SQL-DB":
                    if os.path.exists(APPCFG.sqldb_directory):
                        # Proceed with LLM if available and not cooling down
                        if getattr(APPCFG, "langchain_llm", None) and _llm_available():
                            try:
                                db = SQLDatabase.from_uri(f"sqlite:///{APPCFG.sqldb_directory}")
                                execute_query = QuerySQLDataBaseTool(db=db)
                                write_query = create_sql_query_chain(APPCFG.langchain_llm, db)
                                answer_prompt = PromptTemplate.from_template(APPCFG.agent_llm_system_role)
                                answer = answer_prompt | APPCFG.langchain_llm | StrOutputParser()
                                chain = (RunnablePassthrough.assign(query=write_query).assign(result=itemgetter("query") | execute_query) | answer)
                                response = chain.invoke({"question": message})
                            except Exception as e:
                                # LLM failed (e.g., Google 429). Fall back to SQL-derived summary (already implemented below)
                                if "429" in str(e) or "quota" in str(e).lower():
                                    _activate_llm_cooldown(30)
                                response = ""
                        else:
                            # No LLM available, use direct SQL queries
                            response = ""
                    
                        if not response:  # If no LLM, try to craft a useful SQL-derived answer
                            msg = message.lower()
                            response = ""
                            try:
                                import sqlite3
                                conn = sqlite3.connect(APPCFG.sqldb_directory)
                                cur = conn.cursor()
                                # Pick a table
                                cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
                                tables = [t[0] for t in cur.fetchall()]
                                if not tables:
                                    response = "No tables found in the database."
                                    conn.close()
                                    return "", chatbot + [[message, response]], {
                                        "response": response,
                                        "success": True
                                    }
                                
                                tbl = 'ocean_1' if 'ocean_1' in tables else tables[0]
                                cur.execute(f"PRAGMA table_info({tbl})")
                                cols = [c[1] for c in cur.fetchall()]
                            
                                # detect columns
                                depth_cands = [c for c in cols if any(k in c.lower() for k in ['depth','dep_m','dep'])]
                                temp_cands = [c for c in cols if any(k in c.lower() for k in ['temperature','temp','sst'])]
                            
                                # Check for temperature queries
                                temp_col = temp_cands[0] if temp_cands else None
                                if temp_col and any(k in msg for k in ['range','min','max','temperature','temp']):
                                    cur.execute(f"SELECT MIN({temp_col}), MAX({temp_col}) FROM {tbl} WHERE {temp_col} IS NOT NULL")
                                    tmin, tmax = cur.fetchone()
                                    if tmin is not None and tmax is not None:
                                        response = f"The minimum temperature recorded is {tmin} degrees and the maximum temperature recorded is {tmax} degrees."
                            
                                if not response:
                                    # fallback summary if above didn't fire
                                    cur = conn.cursor()
                                    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 1;")
                                    row = cur.fetchone()
                                    if row:
                                        table_name = row[0]
                                        cur.execute(f"PRAGMA table_info({table_name})")
                                        columns = [c[1] for c in cur.fetchall()]
                                        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
                                        total = cur.fetchone()[0]
                                        cur.execute(f"SELECT * FROM {table_name} LIMIT 5")
                                        preview = cur.fetchall()
                                        response = (
                                            f"Summary for table '{table_name}':\n"
                                            f"Columns: {', '.join(columns)}\n"
                                            f"Total rows: {total}\n"
                                            f"Sample rows (5):\n{preview}"
                                        )
                                        return "", chatbot + [[message, response]], {
                                            "response": response,
                                            "success": True
                                        }
                                    else:
                                        response = "The database is empty (no tables found)."
                                        return "", chatbot + [[message, response]], {
                                            "response": response,
                                            "success": True
                                        }
                            except Exception as e:
                                response = f"Error accessing database: {str(e)}"
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": False,
                                    "error": str(e)
                                }
                            finally:
                                if 'conn' in locals():
                                    conn.close()
                            
                            # If we get here, return the response
                            return "", chatbot + [[message, response]], {
                                "text": response,
                                "response": response,
                                "success": True
                            }
                # --- Case 2: Q&A with Uploaded/Stored CSV/XLSX SQL DB ---
                elif chat_type in ["Q&A with Uploaded CSV/XLSX SQL-DB", "Q&A with stored CSV/XLSX SQL-DB"]:
                    db_path = APPCFG.uploaded_files_sqldb_directory if chat_type == "Q&A with Uploaded CSV/XLSX SQL-DB" else APPCFG.stored_csv_xlsx_sqldb_directory
                    if not os.path.exists(db_path):
                        response = f"SQL DB not found at {db_path}"
                        return "", chatbot + [[message, response]], {
                            "response": response,
                            "success": False,
                            "error": "SQL database not found"
                        }
                    else:
                        if getattr(APPCFG, "langchain_llm", None) and _llm_available():
                            try:
                                engine = create_engine(f"sqlite:///{db_path}")
                                db = SQLDatabase(engine=engine)
                                agent_type = "zero-shot-react-description" if getattr(APPCFG, "use_google_genai", False) else "openai-tools"
                                agent_executor = create_sql_agent(APPCFG.langchain_llm, db=db, agent_type=agent_type, verbose=True)
                                try:
                                    result = agent_executor.invoke({"input": message})
                                    response = result.get("output", "No response generated")
                                    
                                    # Format the response to ensure it's a string
                                    if isinstance(response, (list, tuple)):
                                        response = "\n".join([str(item) for item in response])
                                    elif not isinstance(response, str):
                                        response = str(response)
                                    
                                    # Check if this is a visualization request
                                    is_visualization = any(term in message.lower() for term in ['plot', 'graph', 'chart', 'visualize'])
                                    
                                    # Prepare the response data
                                    response_data = {
                                        "response": response,
                                        "success": True,
                                        "raw_data": str(result),  # For debugging
                                        "needs_visualization": is_visualization
                                    }
                                    
                                    # If this is a visualization request, try to generate a graph
                                    if is_visualization and hasattr(self, 'graph_agent'):
                                        try:
                                            # Extract the data from the SQL query
                                            if 'SELECT' in message.upper() and 'FROM' in message.upper():
                                                # Execute the query to get the data
                                                query = message.split(';')[0]  # Take the first query if multiple
                                                db_path = APPCFG.sqldb_directory
                                                df = self.execute_query(query, db_path)
                                                
                                                if not df.empty:
                                                    # Determine chart type based on query
                                                    chart_type = 'scatter'  # Default to scatter plot
                                                    if 'temperature' in message.lower() and 'depth' in message.lower():
                                                        chart_type = 'scatter'
                                                    
                                                    # Generate the graph
                                                    graph_data = self.graph_agent.generate_graph(
                                                        df, 
                                                        chart_type=chart_type,
                                                        title=message
                                                    )
                                                    
                                                    # Add graph data to response
                                                    response_data.update({
                                                        "graph": graph_data,
                                                        "graph_data": {
                                                            "type": "image",
                                                            "format": "image/png"
                                                        }
                                                    })
                                        except Exception as e:
                                            print(f"Error generating graph: {str(e)}")
                                            response_data["response"] += "\n\nNote: Could not generate the graph."
                                    
                                    # Update chat history with the response
                                    return "", chatbot + [[message, response]], response_data
                                    
                                except Exception as e:
                                    error_msg = f"Error executing query: {str(e)}"
                                    print(f"SQL Agent Error: {error_msg}")
                                    print(f"Error type: {type(e).__name__}")
                                    print(f"Error details: {str(e)}")
                                    
                                    # Provide a more user-friendly error message
                                    if "429" in str(e) or "quota" in str(e).lower():
                                        user_msg = "We've hit the API rate limit. Please try again later or check your API quota."
                                    else:
                                        user_msg = f"Sorry, I encountered an error processing your request: {str(e)}"
                                    
                                    return "", chatbot + [[message, user_msg]], {
                                        "response": user_msg,
                                        "success": False,
                                        "error": str(e)
                                    }
                            except Exception as e:
                                # LLM/Agent failed (e.g., quota). Fall back to direct SQL visualization path below
                                if "429" in str(e) or "quota" in str(e).lower():
                                    _activate_llm_cooldown(30)
                                response = None
                        else:
                            # No LLM available, use direct SQL queries
                            response = None
                            
                        if not response:
                            # Fallback: Direct SQL + Visualization if no LLM or LLM failed
                            try:
                                # Get the SQL response first
                                sql_response = response if response else "No data found."
                                
                                # For graph queries, try to generate a visualization
                                if hasattr(self, 'graph_agent') and self.graph_agent is not None and self.graph_agent.detect_graph_request(message):
                                    try:
                                        # Get the data for visualization
                                        db_path = APPCFG.sqldb_directory
                                        result_df = self.execute_query(f"SELECT * FROM {tables[0]} LIMIT 1000", db_path)
                                        if not result_df.empty:
                                            chart_type = self.graph_agent.determine_chart_type(message, result_df)
                                            plt = self.graph_agent.generate_graph(result_df, chart_type, message)
                                            
                                            # Convert plot to base64 for the response
                                            buf = io.BytesIO()
                                            plt.savefig(buf, format='png')
                                            plt.close()
                                            buf.seek(0)
                                            img_str = base64.b64encode(buf.read()).decode('utf-8')
                                            
                                            # Add image to response
                                            response_data['graph'] = f"data:image/png;base64,{img_str}"
                                            response = "Here's the visualization you requested:"
                                            return "", chatbot, response_data
                                    except Exception as e:
                                        print(f"Error generating graph: {e}")
                                        # Continue with normal response if graph generation fails
                                
                                # Proceed with normal SQL query if not a graph query or if graph generation failed
                                import sqlite3
                                conn = sqlite3.connect(db_path)
                                cursor = conn.cursor()
                                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                                tables = cursor.fetchall()
                                if tables:
                                    table_name = tables[0][0]
                                    cursor.execute(f"PRAGMA table_info({table_name})")
                                    columns = [col[1] for col in cursor.fetchall()]
                                    # If user asks for min/max/range temperature, answer directly from SQL
                                    msg = message.lower()
                                    temp_cands = [c for c in columns if any(k in c.lower() for k in ['temperature','temp','sst'])]
                                    if temp_cands and any(k in msg for k in ['range','min','max','temperature','temp']):
                                        tcol = temp_cands[0]
                                        cursor.execute(f"SELECT MIN({tcol}), MAX({tcol}) FROM {table_name} WHERE {tcol} IS NOT NULL")
                                        tmin, tmax = cursor.fetchone()
                                        if tmin is not None and tmax is not None:
                                            response = f"The minimum temperature recorded is {tmin} degrees and the maximum temperature recorded is {tmax} degrees."
                                    
                                    if not response:
                                        # Get sample data if no specific answer was found
                                        cursor.execute(f"SELECT * FROM {table_name} LIMIT 20")
                                        results = cursor.fetchall()
                                        response = f"Here is a sample of the data from '{table_name}':\n{results[:5]}"
                                else:
                                    response = "No tables found in the database."
                                conn.close()
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": True
                                }
                            except Exception as e:
                                response = f"Error querying database without LLM: {str(e)}"
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": False,
                                    "error": str(e)
                                }
                    
                # --- Case 3: RAG Mode ---
                elif chat_type == "RAG with stored CSV/XLSX ChromaDB":
                    if getattr(APPCFG, "embedding_model", None) is None:
                        response = "No embedding model available. Please check your configuration. Try using local embeddings by setting use_local_embeddings: true in configs/app_config.yml"
                        return "", chatbot + [[message, response]], {
                            "response": response,
                            "success": False,
                            "error": "No embedding model available"
                        }
                    
                    try:
                        # Get the collection first to check its configuration
                        collection = APPCFG.chroma_client.get_collection(
                            name=APPCFG.collection_name
                        )
                        
                        # Get the embedding for the query
                        query_embeddings = APPCFG.embedding_model.embed_query(message)
                        
                        # Get the expected dimension from the collection metadata or use the default based on the model
                        collection_metadata = getattr(collection, 'metadata', {}) or {}
                        expected_dim = collection_metadata.get("embedding_dimension", 
                                                            768 if getattr(APPCFG, "use_google_genai", False) else 384)
                        
                        actual_dim = len(query_embeddings)
                        
                        # Verify dimensions match
                        if actual_dim != expected_dim:
                            # Try to handle dimension mismatch by recreating the collection with correct dimensions
                            print(f"Warning: Embedding dimension mismatch. Expected {expected_dim}, got {actual_dim}. "
                                 "Attempting to recreate collection with correct dimensions...")
                            
                            # Delete the collection to force recreation
                            try:
                                APPCFG.chroma_client.delete_collection(name=APPCFG.collection_name)
                                print(f"Deleted existing collection: {APPCFG.collection_name}")
                            except Exception as e:
                                print(f"Error deleting collection: {e}")
                            
                            # Re-run the pipeline to recreate the collection with correct dimensions
                            from utils.prepare_vectordb_from_csv_xlsx import PrepareVectorDBFromTabularData
                            try:
                                data_prep = PrepareVectorDBFromTabularData(APPCFG.stored_csv_xlsx_directory)
                                data_prep.run_pipeline()
                                # Get the collection again after recreation
                                collection = APPCFG.chroma_client.get_collection(name=APPCFG.collection_name)
                                response = f"Successfully recreated collection with correct dimensions. Please try your query again."
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": True
                                }
                            except Exception as e:
                                response = f"Failed to recreate collection with correct dimensions: {e}"
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": False,
                                    "error": str(e)
                                }
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": False,
                                    "error": str(e)
                                }
                    
                        # Query the collection
                        results = collection.query(
                            query_embeddings=[query_embeddings],
                            n_results=APPCFG.top_k
                        )
                        
                        # Format the results
                        if results and 'documents' in results and results['documents']:
                            formatted_results = []
                            for i, doc in enumerate(results['documents'][0]):
                                formatted_results.append(f"Result {i+1}: {doc}")
                            response = "Here are the most relevant results for your query:\n\n" + "\n\n".join(formatted_results)
                            return "", chatbot + [[message, response]], {
                                "text": response,
                                "response": response,
                                "success": True
                            }
                        else:
                            response = "No relevant results found for your query."
                            return "", chatbot + [[message, response]], {
                                "text": response,
                                "response": response,
                                "success": False,
                                "error": "No relevant results found"
                            }
                    except Exception as e:
                        # Detect Google quota errors and transparently fall back to local embeddings
                        err_text = str(e)
                        if "429" in err_text or "quota" in err_text.lower():
                            _activate_llm_cooldown(60)
                            try:
                                from langchain_community.embeddings import HuggingFaceEmbeddings
                                # Switch to local embeddings at runtime
                                APPCFG.embedding_model = HuggingFaceEmbeddings(
                                    model_name=getattr(APPCFG, "embedding_model_name", "sentence-transformers/all-MiniLM-L6-v2"),
                                    model_kwargs={"device": "cpu"},
                                    encode_kwargs={"normalize_embeddings": True},
                                )
                                
                                # Update the embedding function in the config
                                from chromadb.utils import embedding_functions
                                APPCFG.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                                    model_name="all-MiniLM-L6-v2",
                                    device="cpu",
                                    normalize_embeddings=True
                                )
                                APPCFG.embedding_dimension = 384
                                
                                # Recreate the collection with the new embedding function
                                try:
                                    APPCFG.chroma_client.delete_collection(name=APPCFG.collection_name)
                                    print("Recreating collection with local embeddings...")
                                    from utils.prepare_vectordb_from_csv_xlsx import PrepareVectorDBFromTabularData
                                    data_prep = PrepareVectorDBFromTabularData(APPCFG.stored_csv_xlsx_directory)
                                    data_prep.run_pipeline()
                                    collection = APPCFG.chroma_client.get_collection(name=APPCFG.collection_name)
                                    response = "Successfully switched to local embeddings. Please try your query again."
                                    
                                    # Retry with local embeddings
                                    query_embeddings = APPCFG.embedding_model.embed_query(message)
                                    collection = APPCFG.chroma_client.get_collection(name=APPCFG.collection_name)
                                    results = collection.query(
                                        query_embeddings=[query_embeddings],
                                        n_results=APPCFG.top_k
                                    )
                                    
                                    if results and 'documents' in results and results['documents']:
                                        formatted_results = []
                                        for i, doc in enumerate(results['documents'][0]):
                                            formatted_results.append(f"Result {i+1}: {doc}")
                                        response = "Here are the most relevant results for your query:\n\n" + "\n\n".join(formatted_results)
                                        return "", chatbot + [[message, response]], {
                                            "response": response,
                                            "success": True
                                        }
                                    else:
                                        response = "No relevant results found after switching to local embeddings."
                                        return "", chatbot + [[message, response]], {
                                            "response": response,
                                            "success": False,
                                            "error": "No relevant results found"
                                        }
                                except Exception as e:
                                    response = f"Failed to switch to local embeddings: {str(e)}"
                                    return "", chatbot + [[message, response]], {
                                        "response": response,
                                        "success": False,
                                        "error": str(e)
                                    }
                            except Exception as e:
                                response = (
                                    "RAG is temporarily unavailable due to embedding issues. "
                                    f"Please try again later. Details: {e}"
                                )
                                return "", chatbot + [[message, response]], {
                                    "response": response,
                                    "success": False,
                                    "error": str(e)
                                }
                            
                        # Process results if we have them
                        if results and 'documents' in results and results['documents']:
                            formatted_results = []
                            for i, doc in enumerate(results['documents'][0]):
                                formatted_results.append(f"Result {i+1}: {doc}")
                            response = "Here are the most relevant results for your query:\n\n" + "\n\n".join(formatted_results)
                            return "", chatbot + [[message, response]], {
                                "text": response,
                                "response": response,
                                "success": True
                            }
                        else:
                            response = "No relevant results found for your query."
                            return "", chatbot + [[message, response]], {
                                "text": response,
                                "response": response,
                                "success": False,
                                "error": "No relevant results found"
                            }
                    
                # Handle unsupported chat types
                if chat_type not in ["Q&A with Uploaded CSV/XLSX SQL-DB", "Q&A with stored CSV/XLSX SQL-DB", "RAG with stored CSV/XLSX ChromaDB"]:
                    response = "This chat type is not supported."
                    return "", chatbot + [[message, response]], {
                        "text": response,
                        "response": response,
                        "success": False,
                        "error": "Unsupported chat type"
                    }
                else:
                    # If we get here, the app_functionality is not "Chat"
                    response = "This functionality is not implemented yet."
                    return "", chatbot + [[message, response]], {
                        "response": response,
                        "success": False,
                        "error": "Not implemented"
                    }
            
            # Prepare final response data
            if not response or not isinstance(response, str):
                response = "I couldn't generate a response for your query. Please try asking in a different way or check if the database contains the requested information."
                return "", chatbot + [[message, response]], {
                    "response": response,
                    "success": False,
                    "error": "Failed to generate response"
                }
            
            # Create response data and check if visualization should be added
            response_data = self._prepare_response_with_visualization(message, response)
            chatbot.append((message, response))
            return "", chatbot, response_data
            
        except Exception as e:
            # Catch any unhandled exceptions and return a helpful error message
            error_msg = f"An error occurred while processing your request: {str(e)}"
            print(f"Error in ChatBot.respond: {error_msg}")
            response_data = {
                "response": "I'm sorry, I encountered an error while processing your request. Please try again.",
                "success": False,
                "error": str(e)
            }
            chatbot.append((message, response_data["response"]))
            return "", chatbot, response_data

    def __init__(self):
        """Initialize the ChatBot with optional graph agent."""
        self.graph_agent = SQLGraphAgent(self)  # Initialize graph agent
        
    def _get_sql_response(self, message: str, chat_type: str) -> str:
        """
        Get the SQL response for a given message and chat type.
        
        Args:
            message: The user's message
            chat_type: Type of chat (e.g., "Q&A with stored SQL-DB")
            
        Returns:
            str: The SQL query response as a string
        """
        try:
            if chat_type == "Q&A with stored SQL-DB":
                if os.path.exists(APPCFG.sqldb_directory):
                    # Use direct SQL query to get the response
                    import sqlite3
                    conn = sqlite3.connect(APPCFG.sqldb_directory)
                    cursor = conn.cursor()
                    
                    # Get the first table
                    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1;")
                    table_name = cursor.fetchone()[0]
                    
                    # Simple query to get data (customize based on your needs)
                    query = f"SELECT * FROM {table_name} LIMIT 5"
                    cursor.execute(query)
                    results = cursor.fetchall()
                    
                    # Format the results as a string
                    if results:
                        columns = [desc[0] for desc in cursor.description]
                        response = "\n".join([str(dict(zip(columns, row))) for row in results])
                        return f"Query results:\n{response}"
                    
                    conn.close()
            
            return "No data found."
            
        except Exception as e:
            print(f"Error getting SQL response: {e}")
            return f"Error retrieving data: {str(e)}"
            
    def _prepare_response_with_visualization(self, message: str, response: str) -> dict:
        """
        Prepare the response data dictionary with optional visualization.
        
        Args:
            message: The user's message
            response: The text response to include
            
        Returns:
            dict: Response data with text and optional visualization
        """
        response_data = {"text": response}
        
        # Check if this is a graph-related query
        if hasattr(self, 'graph_agent') and self.graph_agent is not None and self.graph_agent.detect_graph_request(message):
            try:
                # Get the database path based on the current configuration
                db_path = getattr(APPCFG, 'sqldb_directory', None)
                if not db_path or not os.path.exists(db_path):
                    return response_data
                
                # Get the first table in the database
                engine = create_engine(f"sqlite:///{db_path}")
                with engine.connect() as conn:
                    result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1;"))
                    tables = result.fetchall()
                    
                    if tables:
                        table_name = tables[0][0]
                        # Get sample data for visualization
                        result_df = self.execute_query(f"SELECT * FROM {table_name} LIMIT 1000", db_path)
                        
                        if not result_df.empty:
                            # Generate the visualization
                            chart_type = self.graph_agent.determine_chart_type(message, result_df)
                            plt = self.graph_agent.generate_graph(result_df, chart_type, message)
                            
                            # Convert plot to base64 for the response
                            buf = io.BytesIO()
                            plt.savefig(buf, format='png')
                            plt.close()
                            buf.seek(0)
                            img_str = base64.b64encode(buf.read()).decode('utf-8')
                            
                            # Add image to response
                            response_data['graph'] = f"data:image/png;base64,{img_str}"
                            
            except Exception as e:
                print(f"Error in _prepare_response_with_visualization: {e}")
                # If there's an error, just return the text response without visualization
                
        return response_data
        
    def execute_query(self, query: str, db_path: str = None) -> pd.DataFrame:
        """Execute a SQL query and return results as a DataFrame."""
        if db_path is None:
            db_path = APPCFG.sqldb_directory
            
        engine = create_engine(f"sqlite:///{db_path}")
        with engine.connect() as conn:
            try:
                result = conn.execute(text(query))
                columns = result.keys()
                data = result.fetchall()
                return pd.DataFrame(data, columns=columns)
            except Exception as e:
                print(f"Error executing query: {e}")
                return pd.DataFrame()