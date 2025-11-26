import React, { useState } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [quiz, setQuiz] = useState([]);
  const [error, setError] = useState("");

  const onAnalyze = async () => {
    setError("");
    setSummary("");
    setQuiz([]);
    if (!file) {
      setError("Please choose an audio file (mp3/m4a/wav).");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("audio", file);

      const res = await fetch("/api/upload-audio", {
        method: "POST",
        body: fd
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setSummary(data.summary || "");
      setQuiz(Array.isArray(data.quiz) ? data.quiz : []);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "system-ui, Arial" }}>
      <h1>🎧 Study Buddy – AI Recording Helper</h1>
      <p>Upload a lecture/meeting recording. I’ll transcribe it, summarize it (5–7 sentences), and create a 12–16 question quiz.</p>

      <input
        type="file"
        accept=".mp3,.m4a,.wav,.mp4,.mov,.mkv"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <div style={{ marginTop: 16 }}>
        <button onClick={onAnalyze} disabled={loading} style={{ padding: "8px 14px" }}>
          {loading ? "Analyzing..." : "Analyze Recording"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: 12, background: "#fee", color: "#a00", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {summary && (
        <div style={{ marginTop: 24 }}>
          <h2>Summary</h2>
          <p style={{ lineHeight: 1.6 }}>{summary}</p>
        </div>
      )}

      {quiz.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2>Quiz ({quiz.length} questions)</h2>
          {quiz.map((q, i) => (
            <div key={i} style={{ marginBottom: 18, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
              <div style={{ fontWeight: 600 }}>{i + 1}. {q.question}</div>
              <ol type="A" style={{ marginTop: 8 }}>
                {q.choices.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ol>
              <div style={{ fontSize: 13, color: "#555" }}>
                Correct: {["A","B","C","D"][q.correctIndex ?? 0]}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
