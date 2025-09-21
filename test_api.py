import requests
import json

# Test the API endpoint
url = "http://localhost:8000/api/chat"
data = {
    "message": "hello",
    "chat_type": "Q&A with stored CSV/XLSX SQL-DB",
    "app_functionality": "Chat"
}

try:
    response = requests.post(url, json=data, timeout=30)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Success: {result.get('success')}")
        print(f"Response Text: {result.get('response')}")
        print(f"Has Graph: {bool(result.get('graph'))}")
    else:
        print(f"Error: {response.status_code} - {response.text}")
        
except Exception as e:
    print(f"Request failed: {e}")
