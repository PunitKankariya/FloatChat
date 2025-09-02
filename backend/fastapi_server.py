from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import sys
import os

# Add the src directory to the path to import chatbot
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

# Try to import ChatBot, handle import errors gracefully
try:
    from utils.chatbot import ChatBot
    CHATBOT_AVAILABLE = True
except Exception as e:
    print(f"Warning: Could not import ChatBot: {e}")
    CHATBOT_AVAILABLE = False
    
    # Create a mock ChatBot class for testing
    class ChatBot:
        @staticmethod
        def respond(chatbot, message, chat_type, app_functionality):
            return "", chatbot + [[message, f"Mock response to: {message} (ChatBot not available due to missing dependencies)"]]

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
    response: str
    success: bool
    error: str = None

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
        
        # Call the ChatBot.respond method
        result = ChatBot.respond(
            chatbot=chatbot_history,
            message=chat_request.message,
            chat_type=chat_request.chat_type,
            app_functionality=chat_request.app_functionality
        )
        
        # Extract response from the result
        if len(result) >= 2 and len(result[1]) > 0:
            # Get the last message pair (user message, bot response)
            last_interaction = result[1][-1]
            response_text = last_interaction[1] if len(last_interaction) > 1 else "No response generated"
        else:
            response_text = "No response generated"
        
        return ChatResponse(
            response=response_text,
            success=True
        )
        
    except Exception as e:
        return ChatResponse(
            response="",
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
        
        # Extract response
        if len(result) >= 2 and len(result[1]) > 0:
            last_interaction = result[1][-1]
            response_text = last_interaction[1] if len(last_interaction) > 1 else "No response generated"
        else:
            response_text = "No response generated"
        
        return ChatResponse(
            response=response_text,
            success=True
        )
        
    except Exception as e:
        return ChatResponse(
            response="",
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
