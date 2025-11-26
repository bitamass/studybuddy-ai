// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

// ---- OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- App + CORS (allow your Vercel site + local dev)
const app = express();
const PORT = process.env.PORT || 5000;
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://studybuddy-ai-mu.vercel.app",
    ],
    credentials: true,
  })
);
app.use(express.json());

// ---- Ensure uploads directory exists (Render doesn't have it by default)
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ---- Multer to accept audio file under field name "audio"
const upload = multer({ dest: uploadDir });

// ---- Helper: make summary + quiz (strict JSON)
async function generateSummaryAndQuizFromTranscript(transcript) {
  const prompt = `
You are a helpful study assistant. Return ONLY valid JSON.

1) "summary": 4–6 sentence, student-friendly summary of the transcript.
2) "quiz": an array of 8 multiple-choice questions (each has "question", 4 "options", and "correctIndex" 0–3).

JSON SCHEMA:
{
  "summary": "string",
  "quiz": [
    {"question":"string","options":["A","B","C","D"],"correctIndex":0}
  ]
}

TRANSCRIPT:
${transcript}
  `.trim();

const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
        { role: "system", content: "Return STRICT JSON only. No prose." },
        { role: "user", content: prompt }
    ]
});

  const raw = (chat.choices?.[0]?.message?.content || "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("AI JSON parse error. Raw:\n", raw);
    throw new Error("AI returned invalid JSON");
  }
  if (!parsed.summary || !Array.isArray(parsed.quiz)) {
    throw new Error("AI JSON missing 'summary' or 'quiz'");
  }
  return parsed;
}

// ---- Route: upload audio -> transcribe -> summarize -> quiz
app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;

    // Use Whisper for speech-to-text. Accepts mp3, mp4, mpeg/mpga, m4a, wav, webm
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(filePath),
      response_format: "text",
    });

    const transcriptText =
      typeof transcription === "string"
        ? transcription
        : transcription.text || "";

    if (!transcriptText || transcriptText.length < 2) {
      return res
        .status(400)
        .json({ error: "Transcription failed or was empty." });
    }

    const { summary, quiz } =
      await generateSummaryAndQuizFromTranscript(transcriptText);

    return res.json({ summary, quiz });
  } catch (err) {
    console.error("Error in /api/upload-audio:", err);

    // OpenAI file validation errors
    if (err?.error?.code === "unsupported_value" && err?.error?.param === "file") {
      return res
        .status(400)
        .json({ error: "Unsupported file. Use MP3, M4A, WAV, or WEBM." });
    }
    if (err?.status === 401 || err?.error?.code === "invalid_api_key") {
      return res.status(500).json({ error: "Invalid OpenAI API key on server." });
    }
    if (String(err.message || "").includes("AI returned invalid JSON")) {
      return res
        .status(502)
        .json({ error: "AI returned invalid JSON. Try a shorter audio clip." });
    }
    return res.status(500).json({ error: "Server error while processing audio." });
  }
});

// ---- Healthcheck
app.get("/", (_req, res) => res.send("OK"));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
