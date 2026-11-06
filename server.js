const express = require("express");
const cors = require("cors");
const { GoogleAuth } = require("google-auth-library");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// ===== CONFIG =====
const ENGINE_ENDPOINT = process.env.GOOGLE_REASONING_ENGINE_ENDPOINT;
const SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
const sheetsConfigured = true;

// Agent session URLs use the v1beta1 path
const ENGINE_BASE = ENGINE_ENDPOINT
  ? ENGINE_ENDPOINT.replace(/:streamQuery.*$/, "").replace("/v1/", "/v1beta1/")
  : "";
const SESSIONS_URL = `${ENGINE_BASE}/sessions`;

// ===== AUTH (ADC) =====
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// One agent session per participant (in memory)
const sessionByParticipant = {};

// ===== SHEETS (via Apps Script webhook) =====
const fs = require("fs");
const path = require("path");

async function appendToSheet(tab, row) {
  const res = await fetch(SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ tab, row }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (body?.ok !== true) {
    throw new Error(`Sheets did not confirm the save (status ${res.status})`);
  }
}

async function saveExchangeToSheets(
  participantId,
  agentQuestion,
  participantResponse
) {
  if (!sheetsConfigured) return;
  try {
    await appendToSheet("ChatHistory", [
      new Date().toISOString(),
      participantId,
      agentQuestion,
      participantResponse,
    ]);
    console.log(`✓ Exchange saved for ${participantId}`);
  } catch (error) {
    console.error("Error saving to Sheets:", error.message);
  }
}

// ===== AGENT HELPERS =====
async function getOrCreateSession(participantId, authHeader) {
  if (sessionByParticipant[participantId]) {
    return sessionByParticipant[participantId];
  }

  const res = await fetch(SESSIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({ userId: participantId }),
  });
  if (!res.ok) {
    throw new Error(`Session creation failed: ${res.status}`);
  }

  const data = await res.json();
  const name = data.response?.name || data.name;
  const sessionId = name.split("/sessions/")[1].split("/")[0];

  sessionByParticipant[participantId] = sessionId;
  console.log(`✓ Session created for ${participantId}`);
  return sessionId;
}

// Reads the streamed agent output and returns the final text
function parseEngineStream(raw) {
  const texts = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/^data:\s*/, "").trim();
    if (!trimmed.startsWith("{")) continue;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (event.partial === true) continue;
    for (const part of event.content?.parts || []) {
      if (part.text && !part.thought) texts.push(part.text);
    }
  }
  return texts.join("").trim() || "No response from agent";
}

// ===== ENDPOINTS =====
app.get("/api/health", (req, res) => {
  res.json({
    status: "Server is running",
    mode: "reasoning-engine + adc",
    googleSheetsConfigured: sheetsConfigured,
    engineConfigured: !!ENGINE_ENDPOINT,
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, participantId, isStart } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages format" });
    }
    if (!ENGINE_ENDPOINT) {
      return res.status(500).json({
        error: "GOOGLE_REASONING_ENGINE_ENDPOINT not set in .env",
      });
    }

    const userId = participantId || "anonymous";
    const lastUserMessage = messages[messages.length - 1];

    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const authHeader = `Bearer ${token.token}`;

    const sessionId = await getOrCreateSession(userId, authHeader);

    const response = await fetch(ENGINE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        class_method: "async_stream_query",
        input: {
          user_id: userId,
          session_id: sessionId,
          message: lastUserMessage.content,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Engine API error: ${response.status}`, errorText);
      throw new Error(`Engine API error: ${response.status}`);
    }

    const raw = await response.text();
    const assistantMessage = parseEngineStream(raw);
    console.log("✓ Agent replied");

    if (participantId && !isStart) {
      await saveExchangeToSheets(
        participantId,
        assistantMessage,
        lastUserMessage.content
      );
    }

    res.json({ success: true, message: assistantMessage });
  } catch (error) {
    console.error("❌ Engine Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/save-transcript", async (req, res) => {
  try {
    const {
      participantId,
      participantName,
      taskTitle,
      conversationHistory,
      timestamp,
    } = req.body;

    if (!sheetsConfigured) {
      return res.json({
        success: true,
        message: "Transcript received (Google Sheets not configured)",
        savedToSheets: false,
      });
    }

    const fullTranscript = conversationHistory
      .map(
        (msg) =>
          `${msg.role === "user" ? participantName : "Agent"}: ${msg.content}`
      )
      .join("\n\n");

    await appendToSheet("Transcripts", [
      participantId,
      participantName,
      taskTitle,
      timestamp || new Date().toISOString(),
      fullTranscript,
      conversationHistory.length,
    ]);

    res.json({
      success: true,
      message: "Transcript saved to Google Sheets",
      savedToSheets: true,
    });
  } catch (error) {
    console.error("Error saving transcript:", error.message);
    res.json({
      success: true,
      message:
        "Transcript received (saving to Sheets failed, but download works)",
      savedToSheets: false,
      error: error.message,
    });
  }
});

app.get("/api/config/check", (req, res) => {
  res.json({
    engineConfigured: !!ENGINE_ENDPOINT,
    sheetsConfigured,
    adcAuthenticated: true,
  });
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`\n✓ Server running on http://localhost:${PORT}`);
  console.log(`✓ Portal: http://localhost:${PORT}`);
  console.log(`✓ Engine: ${ENGINE_ENDPOINT ? "CONFIGURED" : "NOT CONFIGURED"}`);
  console.log(
    `✓ Sheets: ${sheetsConfigured ? "CONFIGURED" : "NOT CONFIGURED"}\n`
  );
});
