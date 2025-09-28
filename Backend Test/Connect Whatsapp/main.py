import os
import json
import sys
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure the Gemini API with your key
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY not found. Please set it in the .env file.")
    sys.exit(1)
genai.configure(api_key=api_key)

# --- Get the directory where this Python script is located ---
# This makes the path reliable, no matter where you run the script from.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# --- Create a full, reliable path to the JSON file ---
# It will now correctly look for the file inside the 'node_script' folder.
CONVERSATIONS_FILE = os.path.join(SCRIPT_DIR, 'messages.json')

def get_gemini_response(user_id):
    """
    Reads conversation history, sends it to Gemini, and returns the response.
    """
    try:
        # Read the entire conversations object
        with open(CONVERSATIONS_FILE, 'r') as f:
            all_conversations = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        # If the file doesn't exist or is empty, there's no history
        print("Error: Conversation file not found or is empty.")
        return

    # Get the specific user's message history
    user_history = all_conversations.get(user_id)
    if not user_history:
        print(f"Error: No history found for user {user_id}.")
        return

    # Set up the generative model
    model = genai.GenerativeModel('gemini-pro')
    
    # Start a chat session and load the history
    # The history must alternate between 'user' and 'model' roles
    chat = model.start_chat(history=user_history)
    
    # The last message in our history is the new user prompt
    last_message = user_history[-1]['parts'][0]

    try:
        # Send the new prompt to the chat
        response = chat.send_message(last_message)
        # The script's final output is the Gemini response text
        print(response.text)
    except Exception as e:
        print(f"Error communicating with Gemini API: {e}")

if __name__ == "__main__":
    # The Node.js script will pass the user_id as a command-line argument
    if len(sys.argv) > 1:
        user_id_argument = sys.argv[1]
        get_gemini_response(user_id_argument)
    else:
        print("Error: No user ID provided.")