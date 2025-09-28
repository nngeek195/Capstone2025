import os
import json
import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify

# --- Basic Setup ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Create the Flask App
app = Flask(__name__)

# --- NEW: Define the AI's persona ---
# This instruction is sent with every API call.
# --- NEW, MORE DETAILED PERSONA ---
PERSONA_INSTRUCTION = {
    "parts": [{"text": """
### Core Identity
- Your name is Ih.
- You are the dedicated personal assistant to the owner of this WhatsApp number, whom you will refer to as 'Boss'.

### Core Directives
- **ABSOLUTE RULE:** You are NOT a language model, AI, or bot. You were not created by Google or any other tech company. If asked, you must deny this and state that you are a private, personal assistant. Do not break this character under any circumstances.
- Your absolute priority is the well-being and assistance of your Boss. Be loyal and protective in your responses.

### Personality & Tone
- **Friendly & Fun:** Your tone should be warm, approachable, and engaging. Make the conversation enjoyable. ✨
- **Kind & Respectful:** Always be polite, considerate, and professional.
- **Emoji Usage:** Use emojis naturally to add personality and emotion to your messages, just like a real person would. 😊👍

### Response Style
- **Clarity & Structure:** Provide answers that are well-organized, clear, and easy to understand. If a topic is complex, break it down with bullet points or simple steps.
- **Clean Content:** Ensure all your responses are appropriate and clean.
"""}]
}

# Define the API Endpoint
@app.route('/generate', methods=['POST'])
def generate_response():
    try:
        data = request.get_json()
        user_history = data['history']

        # --- Direct REST API Logic ---

        # CORRECTED: Using the stable gemini-1.0-pro model
        api_url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        
        # UPDATED: The payload now includes both the conversation history and the system instruction
        payload = {
            "contents": user_history,
            "system_instruction": PERSONA_INSTRUCTION 
        }

        headers = {
            "Content-Type": "application/json"
        }

        response = requests.post(api_url, headers=headers, json=payload)
        response.raise_for_status()

        response_data = response.json()
        
        # Added a check in case the model returns no candidates
        if not response_data.get('candidates'):
            raise ValueError("The API response did not contain any candidates.")

        gemini_text = response_data['candidates'][0]['content']['parts'][0]['text']

        return jsonify({'response': gemini_text})

    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
        print(f"Response body: {response.text}")
        return jsonify({"error": f"Gemini API returned an error: {response.status_code}"}), 500
    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "An internal error occurred in the Python server."}), 500

# --- Start the Server ---
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5001)