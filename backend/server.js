// === SANITY HEADER: must be the first lines ===
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const OpenAI = require("openai");

// Create the app BEFORE any app.use/app.post
const app = express();
console.log("[server] app created");

const PORT = process.env.PORT || 10000;

// basic middleware early so app.* calls below are valid
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// quick probe so we can verify in logs that app exists
app.get("/ping", (_req, res) => res.json({ ok: true, t: Date.now() }));

// === keep the rest of your server.js BELOW this line ===


// Ensure uploads directory exists (works locally + on Render)
const uploadsDir = path.join(process.cwd(), "backend", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config (disk storage + type filter)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = path.basename(file.originalname || "audio", ext).replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${base}${ext || ".bin"}`);
  },
});

// Accept the formats Whisper supports (+ common aliases seen in browsers/OS)
const allowed = new Set([
  "audio/mpeg",   // mp3
  "audio/mp3",    // mp3 alias
  "audio/mpga",   // mpga
  "audio/ogg",
  "audio/oga",
  "audio/wav",
  "audio/webm",
  "audio/mp4",    // m4a/mp4
  "audio/x-m4a",
  "video/mp4",    // some m4a/mp4 uploads use this
]);

const fileFilter = (_req, file, cb) => {
  // helpful server log for debugging uploads
  console.log("Upload ->", file.originalname, "| type:", file.mimetype);
  if (allowed.has(file.mimetype)) cb(null, true);
  else cb(new Error(`Unsupported file type: ${file.mimetype}`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// ---------- OpenAI ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helpers
function safeJSONParse(str) {
  try {
    return { ok: true, value: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function summarizeAndQuiz(transcript) {
  const prompt = `
TRANSCRIPT:
${transcript}
---

Return STRICT JSON ONLY. No prose. Shape:

{
  "summary": "<5-7 sentence student-friendly summary>",
  "quiz": [
    {
      "question": "<clear, single-concept MCQ>",
      "choices": ["A", "B", "C", "D"],
      "answerIndex": 0,
      "explanation": "<1-2 sentence why the correct answer is right>"
    }
  ]
}

Rules:
- 5–7 sentence summary.
- 12–16 multiple-choice questions.
- Randomize correct answer positions.
- Use plain text only; avoid Markdown.
- Keep choices short and mutually exclusive.
`;

  const chat = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: "Return STRICT JSON only. No prose." },
      { role: "user", content: prompt },
    ],
  });

  const raw = (chat.choices?.[0]?.message?.content || "").trim();
  const parsed = safeJSONParse(raw);
  if (!parsed.ok) {
    // Try to salvage JSON if model added wrappers
    const match = raw.match(/\{[\s\S]*\}$/);
    if (match) {
      const salvage = safeJSONParse(match[0]);
      if (salvage.ok) return salvage.value;
    }
    throw new Error("AI returned invalid JSON.");
  }
  return parsed.value;
}

// ---------- Routes ----------
app.get("/", (_req, res) => res.send("OK"));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Upload -> Transcribe -> Summarize+Quiz
app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  // If filter failed, multer won't set file; treat as 415 (unsupported)
  if (!req.file) {
    return res
      .status(415)
      .json({ error: "Unsupported or missing audio file. Try mp3, wav, m4a, webm, or ogg." });
  }

  const audioPath = req.file.path;

  try {
    // 1) Transcribe (Whisper)
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(audioPath),
      response_format: "text",
      temperature: 0,
    });

    const transcript = (transcription || "").toString().trim();
    if (!transcript) {
      return res
        .status(400)
        .json({ error: "Transcription returned empty text. Try a clearer/longer clip." });
    }

    // 2) Summarize + create quiz
    const result = await summarizeAndQuiz(transcript);

    // Quick shape checks
    if (
      !result ||
      typeof result.summary !== "string" ||
      !Array.isArray(result.quiz) ||
      result.quiz.length < 12
    ) {
      return res
        .status(502)
        .json({ error: "AI returned malformed payload. Please try a different clip." });
    }

    return res.json({
      summary: result.summary,
      quiz: result.quiz,
    });
  } catch (err) {
    console.error("[/api/upload-audio] error:", err?.message || err);
    const msg =
      err?.message?.includes("Unsupported file type")
        ? err.message
        : "Server error while processing audio.";
    return res.status(500).json({ error: msg });
  } finally {
    // Clean up the uploaded file
    fs.promises
      .unlink(audioPath)
      .catch(() => console.warn("Cleanup: could not remove temp file:", audioPath));
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});