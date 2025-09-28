require("dotenv").config();
const fs = require("fs");
// Import the 'exec' function to run external scripts
const { exec } = require("child_process");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

const AUTH_FOLDER_PATH = "auth_info";
// The new JSON file for storing conversations by user
const CONVERSATIONS_FILE_PATH = "conversations.json";

async function startWhatsApp() {
  console.log("🔄 Starting WhatsApp connection...");

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "22.04.4"],
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;
    if (qr) {
      console.log("📱 Scan this QR code with your WhatsApp app:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`❌ Logged out. Please delete the '${AUTH_FOLDER_PATH}' folder and restart.`);
      } else {
        console.log("🔌 Connection closed. Attempting to reconnect...");
        startWhatsApp().catch(console.error);
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp connection opened successfully!");
    }
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!messageText) {
      console.log("📢 Received a non-text message. Skipping AI processing.");
      return;
    }

    // The chat ID is our unique identifier for the user or group
    const chatId = msg.key.remoteJid;
    console.log(`💬 Received message from ${chatId}: "${messageText}"`);

    // --- NEW LOGIC FOR CONVERSATION HISTORY ---
    try {
      let allConversations = {};
      // 1. Read existing conversations
      if (fs.existsSync(CONVERSATIONS_FILE_PATH)) {
        const fileContent = fs.readFileSync(CONVERSATIONS_FILE_PATH, "utf-8");
        if (fileContent) allConversations = JSON.parse(fileContent);
      }

      // 2. Get the history for the current user, or create it if it's new
      let userHistory = allConversations[chatId] || [];

      // 3. Add the new message to the history with the 'user' role
      userHistory.push({ role: "user", parts: [messageText] });

      // Update the main conversations object
      allConversations[chatId] = userHistory;

      // 4. Save the updated conversations back to the file
      fs.writeFileSync(CONVERSATIONS_FILE_PATH, JSON.stringify(allConversations, null, 2));
      console.log(`💾 Saved message to history for ${chatId}`);

      // --- NEW LOGIC TO CALL PYTHON SCRIPT ---
      console.log(`🧠 Calling Python script for AI response...`);
      // We execute the python script and pass the chatId as an argument
      const command = `python gemini_handler.py "${chatId}"`;

      exec(command, async (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error executing Python script: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`🐍 Python script stderr: ${stderr}`);
        }

        const geminiResponse = stdout.trim();
        if (geminiResponse) {
          console.log(`🤖 Gemini Response: "${geminiResponse}"`);

          // Add Gemini's response to our history with the 'model' role
          userHistory.push({ role: "model", parts: [geminiResponse] });
          allConversations[chatId] = userHistory;
          fs.writeFileSync(CONVERSATIONS_FILE_PATH, JSON.stringify(allConversations, null, 2));

          // Send the response back to the user on WhatsApp
          await sock.sendMessage(chatId, { text: geminiResponse });
          console.log(`✅ Sent Gemini response to ${chatId}`);
        }
      });
    } catch (err) {
      console.error("❌ An error occurred in the message handling logic:", err);
    }
  });
}

startWhatsApp().catch((err) => {
  console.error("An unexpected error occurred:", err);
});