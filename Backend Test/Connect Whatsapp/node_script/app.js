require("dotenv").config();
const fs = require("fs");
// We now use Axios instead of 'exec'
const axios = require("axios");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

const AUTH_FOLDER_PATH = "auth_info";
const CONVERSATIONS_FILE_PATH = "conversations.json";
// The URL where our Python API server is running
const PYTHON_API_URL = "http://127.0.0.1:5001/generate";

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
    if (!messageText) return;

    const chatId = msg.key.remoteJid;
    console.log(`💬 Received message from ${chatId}: "${messageText}"`);

    try {
      let allConversations = {};
      if (fs.existsSync(CONVERSATIONS_FILE_PATH)) {
        const fileContent = fs.readFileSync(CONVERSATIONS_FILE_PATH, "utf-8");
        if (fileContent) allConversations = JSON.parse(fileContent);
      }
      let userHistory = allConversations[chatId] || [];
      userHistory.push({ role: "user", parts: [messageText] });
      allConversations[chatId] = userHistory;
      fs.writeFileSync(CONVERSATIONS_FILE_PATH, JSON.stringify(allConversations, null, 2));

      // --- NEW LOGIC: Call the Python API using Axios ---
      console.log(`🧠 Sending history to Python API server...`);

      // We send the entire history in the request body
      const apiResponse = await axios.post(PYTHON_API_URL, {
        history: userHistory,
      });

      const geminiResponse = apiResponse.data.response;

      if (geminiResponse) {
        console.log(`🤖 Gemini Response: "${geminiResponse}"`);
        userHistory.push({ role: "model", parts: [geminiResponse] });
        allConversations[chatId] = userHistory;
        fs.writeFileSync(CONVERSATIONS_FILE_PATH, JSON.stringify(allConversations, null, 2));
        await sock.sendMessage(chatId, { text: geminiResponse });
        console.log(`✅ Sent Gemini response to ${chatId}`);
      }
    } catch (err) {
      console.error("❌ An error occurred:", err.message);
      // Let the user know something went wrong
      await sock.sendMessage(chatId, { text: "Sorry, I couldn't get a response. Please try again." });
    }
  });
}

startWhatsApp().catch((err) => {
  console.error("An unexpected error occurred:", err);
});