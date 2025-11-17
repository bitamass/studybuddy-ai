require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

// Create OpenAI client using your API key from .env
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Store uploads in /uploads
const upload = multer({
  dest: path.join(__dirname, "uploads"),
});

// Use AI to turn transcript into summary + quiz JSON
async function generateSummaryAndQuizFromTranscript(transcript) {
  const prompt = `
You are a helpful study assistant. I will give you a lecture or meeting transcript.
1. Write a clear, student-friendly summary in 5–6 sentences.
2. Create 8–12 multiple-choice questions that check understanding of the KEY ideas.
3. Each question must have exactly 4 answer choices.
4. Indicate which choice is correct using "correctIndex" (0-based).
5. IMPORTANT: Return ONLY valid JSON, no extra text, no backticks, no commentary.
JSON format example:
{
  "summary": "string",
  "quiz": [
    {
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 1
    }
  ]
}

Now use this transcript:

${transcript}
  `;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You create summaries and quizzes in strict JSON format.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.4,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse AI JSON:", raw);
    throw new Error("AI returned invalid JSON");
  }

  if (!parsed.summary || !Array.isArray(parsed.quiz)) {
    throw new Error("AI JSON missing summary or quiz");
  }

  return parsed; // { summary, quiz }
}

// Route: upload audio → transcribe → summarize → quiz
app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    console.log("Received file:", req.file);

    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const audioPath = req.file.path;

    // 1) Transcribe audio
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "gpt-4o-mini-transcribe",
    });

    const transcriptText = transcription.text;
    console.log("Transcript sample:", transcriptText.slice(0, 200) + "...");

    // 2) Generate summary + quiz
    const { summary, quiz } = await generateSummaryAndQuizFromTranscript(
      transcriptText
    );

    // 3) Send back to frontend
    res.json({ summary, quiz });
  } catch (err) {
    console.error("Error in /api/upload-audio:", err);
    res.status(500).json({
      error: "Failed to process audio with AI. Check server logs.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
