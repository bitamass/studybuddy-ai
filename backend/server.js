require("dotenv").config();
import express from 'express';
import cors from 'cors';
// --- AUDIO UPLOAD + TRANSCRIPTION SETUP ---
import path from "path";
import fs from "fs";
import multer from "multer";

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => 
    cb(null, path.join(process.cwd(), "backend", "uploads")),
  filename: (req, file, cb) => cb(null, file.originalname),
});

// Accept audio formats and log them
const fileFilter = (req, file, cb) => {
  const ok = [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/mpga",
    "audio/x-m4a",
    "audio/m4a",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
  ];
  console.log("[upload] mimetype:", file.mimetype, "name:", file.originalname);
  if (ok.includes(file.mimetype)) return cb(null, true);
  console.warn("[upload] unusual mimetype, allowing:", file.mimetype);
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- UPLOAD ROUTE ---
app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;
    const stats = fs.statSync(filePath);

    console.log("[upload] saved file:", {
      path: filePath,
      size: stats.size,
      mimetype: req.file.mimetype,
    });

    if (!stats.size) {
      console.error("[upload] zero-byte file");
      return res.status(400).json({ error: "Uploaded file is empty" });
    }

    // Transcribe using OpenAI
    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: fs.createReadStream(filePath),
    });

    const transcriptText = transcription.text || "";

    const { summary, quiz } =
      await generateSummaryAndQuizFromTranscript(transcriptText);

    res.json({ summary, quiz });
  } catch (err) {
    console.error("[openai error]", err);
    res.status(400).json({ error: err.message });
  } finally {
    try {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
    } catch {}
  }
});

// ---------- API: upload audio ----------
app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file received." });

    const audioPath = req.file.path;

    // 1) Transcribe (use whisper-1 to avoid access issues)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1"
    });

    const transcriptText = transcription?.text?.trim() || "";
    if (!transcriptText) {
      return res.status(400).json({ error: "Empty transcription. Try a clearer or longer clip." });
    }

    // 2) Summary + quiz
    const result = await summarizeAndQuiz(transcriptText);

    // cleanup
    fs.unlink(audioPath, () => {});

    res.json(result);
  } catch (err) {
    console.error("Error in /api/upload-audio:", err);
    return res.status(500).json({ error: err.message || "Server error while processing audio." });
  }
});

// ---------- Serve frontend build ----------
const distDir = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(distDir));

// Health / root
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
