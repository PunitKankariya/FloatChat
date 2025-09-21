#!/usr/bin/env python3
import sys
import os
import traceback

# Add the src directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

print("Starting debug...")

try:
    print("1. Testing basic imports...")
    from utils.load_config import LoadConfig
    print("✓ LoadConfig imported successfully")
    
    print("2. Creating LoadConfig instance...")
    config = LoadConfig()
    print("✓ LoadConfig instance created")
    
    print("3. Testing database paths...")
    print(f"SQL DB path: {config.sqldb_directory}")
    print(f"CSV/XLSX SQL DB path: {config.stored_csv_xlsx_sqldb_directory}")
    print(f"ChromaDB path: {config.persist_directory}")
    
    print("4. Checking if databases exist...")
    print(f"SQL DB exists: {os.path.exists(config.sqldb_directory)}")
    print(f"CSV/XLSX SQL DB exists: {os.path.exists(config.stored_csv_xlsx_sqldb_directory)}")
    print(f"ChromaDB exists: {os.path.exists(config.persist_directory)}")
    
    print("5. Testing SQLite connection...")
    import sqlite3
    if os.path.exists(config.stored_csv_xlsx_sqldb_directory):
        conn = sqlite3.connect(config.stored_csv_xlsx_sqldb_directory)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        print(f"✓ Tables in CSV/XLSX DB: {tables}")
        conn.close()
    else:
        print("✗ CSV/XLSX SQL DB does not exist")
    
    print("6. Testing ChatBot import...")
    from utils.chatbot import ChatBot
    print("✓ ChatBot imported successfully")
    
    print("7. Testing a simple chat response...")
    chatbot_history = []
    result = ChatBot.respond(
        chatbot=chatbot_history,
        message="What is the temperature range?",
        chat_type="Q&A with stored CSV/XLSX SQL-DB",
        app_functionality="Chat"
    )
    print(f"✓ Chat response: {result}")
    
except Exception as e:
    print(f"✗ Error: {e}")
    traceback.print_exc()
