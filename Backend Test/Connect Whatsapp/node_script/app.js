// Use dotenv to manage environment variables, though not strictly needed for this script
require("dotenv").config();

// Import necessary modules
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

// Define file paths for session authentication and message storage
const AUTH_FOLDER_PATH = "auth_info";
const JSON_FILE_PATH = "messages.json";

/**
 * The main function that initializes and runs the WhatsApp bot.
 */
async function startWhatsApp() {
  console.log("🔄 Starting WhatsApp connection...");

  // Use multi-file authentication state to save and reuse the session
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER_PATH);

  // Fetch the latest version of Baileys
  const { version } = await fetchLatestBaileysVersion();

  // Create a new WhatsApp socket connection
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // We will manually handle QR code printing
    browser: ["Ubuntu", "Chrome", "22.04.4"], // Mimic a browser environment
  });

  // ---- Set up event listeners for the socket ----

  // 1. Handle connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("📱 Scan this QR code with your WhatsApp app:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Connection closed. Reason: ${statusCode}`);

      // If the user was logged out, stop the process
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(
          `❌ Logged out. Please delete the '${AUTH_FOLDER_PATH}' folder and restart.`
        );
      } else {
        // For all other connection issues, try to reconnect
        console.log("Attempting to reconnect...");
        startWhatsApp().catch(console.error);
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp connection opened successfully!");
    }
  });

  // 2. Save session credentials whenever they are updated
  sock.ev.on("creds.update", saveCreds);

  // 3. Listen for and process incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];

    // Ignore notifications, messages from yourself, and messages without content
    if (!msg.message || msg.key.fromMe) {
      return;
    }

    // Extract the message text (handles both simple and extended text messages)
    const messageText =
      msg.message.conversation || msg.message.extendedTextMessage?.text;

    // Only proceed if there is actual text content
    if (!messageText) {
      console.log(
        "📢 Received a non-text message (e.g., image, sticker). Skipping."
      );
      return;
    }

    // Determine the sender's ID (handles both private and group chats)
    const senderId = msg.key.remoteJid.endsWith("@g.us")
      ? msg.key.participant
      : msg.key.remoteJid;

    // Create a structured object for the new message
    const newMessage = {
      id: msg.key.id,
      timestamp: msg.messageTimestamp,
      sender: senderId,
      senderName: msg.pushName,
      chatId: msg.key.remoteJid,
      messageType: "text",
      content: messageText,
    };

    // Save the message to the JSON file
    try {
      let messages = [];
      // If the file exists, read its content
      if (fs.existsSync(JSON_FILE_PATH)) {
        const fileContent = fs.readFileSync(JSON_FILE_PATH, "utf-8");
        // Check if file is not empty before parsing
        if (fileContent) {
          messages = JSON.parse(fileContent);
        }
      }

      // Add the new message to the array
      messages.push(newMessage);

      // Write the updated array back to the file with pretty formatting (2-space indentation)
      fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(messages, null, 2));

      console.log(
        `✅ Message from '${newMessage.senderName}' saved to ${JSON_FILE_PATH}`
      );
    } catch (error) {
      console.error("❌ Failed to save message to JSON file:", error);
    }
  });

  return sock;
}

// ---- Start the bot ----
startWhatsApp().catch((err) => {
  console.error("An unexpected error occurred:", err);
});