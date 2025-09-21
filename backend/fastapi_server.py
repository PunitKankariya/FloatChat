import os
import sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any, Tuple

# Add the src directory to the path to import chatbot
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

# Set environment variables for LangChain
os.environ['LANGCHAIN_TRACING_V2'] = 'false'
os.environ['LANGCHAIN_ENDPOINT'] = ''

# Try to import ChatBot, handle import errors gracefully
try:
    from utils.chatbot import ChatBot
    # Environment and API key handling is encapsulated in utils.load_config
    chatbot_instance = ChatBot()
    CHATBOT_AVAILABLE = True
except ImportError as e:
    import traceback
    print(f"Warning: Could not import ChatBot: {e}")
    print("Detailed error:")
    traceback.print_exc()
    print("\nPlease install the required dependencies by running:")
    print("pip install langchain-community langchain-core langchain sqlalchemy chromadb openai")
    
    CHATBOT_AVAILABLE = False
    
    # Create a mock ChatBot class for testing
    class MockChatBot:
        def respond(self, chatbot: List, message: str, chat_type: str, app_functionality: str) -> Tuple[str, List, Optional[dict]]:
            return "", chatbot + [[message, f"Error: ChatBot is in mock mode. Please check the server logs for dependency issues.\n\nTo fix this, run:\n```\npip install langchain-community langchain-core langchain sqlalchemy chromadb openai\n```"]], None
    
    chatbot_instance = MockChatBot()

app = FastAPI(title="FloatChat API", version="1.0.0")

# Configure CORS - more permissive for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=False,  # Set to False when using allow_origins=["*"]
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class ChatMessage(BaseModel):
    message: str
    chat_type: str
    app_functionality: str = "Chat"

class ChatResponse(BaseModel):
    response: Optional[str] = None
    graph: Optional[str] = None
    graph_data: Optional[dict] = None
    success: bool = True
    error: Optional[str] = None

class ChatHistory(BaseModel):
    history: List[List[str]]

# In-memory storage for chat history (in production, use a database)
chat_sessions: Dict[str, List[List[str]]] = {}

@app.get("/")
async def root():
    return {"message": "FloatChat FastAPI Backend is running!"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "FastAPI backend is working fine!"}

@app.options("/api/chat")
async def chat_options():
    return {"message": "OK"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(chat_request: ChatMessage):
    """
    Main chat endpoint that processes user messages using the ChatBot class
    """
    try:
        # Initialize empty chatbot history for this request
        chatbot_history = []
        
        # Process the message using ChatBot
        response, updated_chat, response_data = chatbot_instance.respond(
            chatbot_history, 
            chat_request.message, 
            chat_request.chat_type, 
            "Chat"
        )
        
        # Prepare the response
        if not response_data or not isinstance(response_data, dict):
            response_data = {"response": "⚠️ No response generated from chatbot.", "success": False}
        
        # Log the response data for debugging (without printing large data blobs)
        debug_data = response_data.copy()
        if 'graph' in debug_data and debug_data['graph'] and len(str(debug_data['graph'])) > 100:
            debug_data['graph'] = f"[GRAPH_DATA: {len(str(debug_data['graph']))} bytes]"
        if 'graph_data' in debug_data and debug_data['graph_data']:
            debug_data['graph_data'] = "[GRAPH_DATA_OBJECT]"
        print(f"[DEBUG] Response data from ChatBot: {debug_data}")
        
        # Ensure we have a response field
        response_text = response_data.get("response", response_data.get("text", ""))
        
        # Prepare graph data if available
        graph_data = None
        if response_data.get("graph"):
            if isinstance(response_data["graph"], str):
                # If it's already a data URL, use it as is
                if response_data["graph"].startswith("data:image/"):
                    graph_data = response_data["graph"]
                # If it's a base64 string, add the data URL prefix
                else:
                    graph_data = f"data:image/png;base64,{response_data['graph']}"
            # If it's a dictionary with a 'data' field
            elif isinstance(response_data["graph"], dict) and "data" in response_data["graph"]:
                graph_data = f"data:image/png;base64,{response_data['graph']['data']}"
        
        # Log graph data status
        if graph_data:
            print(f"[DEBUG] Graph data prepared, length: {len(graph_data)}")
        
        # Create the response with all available data
        return ChatResponse(
            response=response_text,
            graph=graph_data,
            graph_data=response_data.get("graph_data"),
            success=response_data.get("success", False),
            error=response_data.get("error")
        )
        
    except Exception as e:
        return ChatResponse(
            response=f"⚠️ Error: {str(e)}",
            graph=None,
            graph_data=None,
            success=False,
            error=str(e)
        )

@app.get("/api/chat-types")
async def get_chat_types():
    """
    Get available chat types for the frontend
    """
    return {
        "chat_types": [
            "Q&A with stored SQL-DB",
            "Q&A with Uploaded CSV/XLSX SQL-DB",
            "Q&A with stored CSV/XLSX SQL-DB",
            "RAG with stored CSV/XLSX ChromaDB"
        ]
    }

@app.post("/api/chat/session/{session_id}")
async def chat_with_session(session_id: str, chat_request: ChatMessage):
    """
    Chat endpoint with session management
    """
    try:
        # Get or create session history
        if session_id not in chat_sessions:
            chat_sessions[session_id] = []
        
        chatbot_history = chat_sessions[session_id]
        
        # Call the ChatBot.respond method
        result = ChatBot.respond(
            chatbot=chatbot_history,
            message=chat_request.message,
            chat_type=chat_request.chat_type,
            app_functionality=chat_request.app_functionality
        )
        
        # Update session history
        if len(result) >= 2:
            chat_sessions[session_id] = result[1]
        
        # Extract response safely from ChatBot.respond return
        response_text = None
        if isinstance(result, tuple) and len(result) == 3:
            _, _, response_data = result
            if isinstance(response_data, dict):
                response_text = response_data.get("text")

        response_text = response_text or "⚠️ No response generated from chatbot."

        return ChatResponse(
            response=response_text,
            success=True
        )
        
    except Exception as e:
        return ChatResponse(
            response=f"⚠️ Error: {str(e)}",
            success=False,
            error=str(e)
        )

@app.get("/api/chat/session/{session_id}/history")
async def get_chat_history(session_id: str):
    """
    Get chat history for a specific session
    """
    if session_id in chat_sessions:
        return ChatHistory(history=chat_sessions[session_id])
    else:
        return ChatHistory(history=[])

@app.delete("/api/chat/session/{session_id}")
async def clear_chat_session(session_id: str):
    """
    Clear chat history for a specific session
    """
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        return {"message": f"Session {session_id} cleared successfully"}
    else:
        return {"message": f"Session {session_id} not found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
