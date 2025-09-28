import os
import json
import sys
import google.generativeai as genai
from dotenv import load_dotenv
from flask import Flask, request, jsonify

# --- Basic Setup ---
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# --- Create the Flask App ---
# This is the core of our server
app = Flask(__name__)

# --- Define the API Endpoint ---
# This function will run when Node.js sends a request to http://.../generate
@app.route('/generate', methods=['POST'])
def generate_response():
    try:
        # Get the data sent by the Node.js script
        data = request.get_json()
        if not data or 'history' not in data:
            return jsonify({"error": "Invalid request, 'history' is required."}), 400

        user_history = data['history']

        # --- Gemini Logic (same as before) ---
        model = genai.GenerativeModel('gemini-pro')
        chat = model.start_chat(history=user_history)
        
        last_message = user_history[-1]['parts'][0]
        response = chat.send_message(last_message)

        # --- Send the response back to Node.js ---
        return jsonify({'response': response.text})

    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "Failed to generate response from Gemini."}), 500

# --- Start the Server ---
if __name__ == "__main__":
    # The server will run on localhost at port 5001
    # The "0.0.0.0" host makes it accessible on your local network
    app.run(host='0.0.0.0', port=5001)