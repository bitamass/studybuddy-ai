import { useState } from "react";

function App() {
  const [file, setFile] = useState(null);
  const [summary, setSummary] = useState("");
  const [quiz, setQuiz] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // NEW: track selected answers and results
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionIndex]: optionIndex }
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setSummary("");
    setQuiz([]);
    setError("");
    setSelectedAnswers({});
    setShowResults(false);
    setScore(null);
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose an audio file first.");
      return;
    }

    setLoading(true);
    setError("");
    setSummary("");
    setQuiz([]);
    setSelectedAnswers({});
    setShowResults(false);
    setScore(null);

    try {
      const formData = new FormData();
      formData.append("audio", file);

      const res = await fetch("https://studybuddy-ai-js9w.onrender.com/api/upload-audio", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Server error");
      }

      const data = await res.json();
      setSummary(data.summary);
      setQuiz(data.quiz || []);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Check the server and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOptionChange = (questionIndex, optionIndex) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
    if (showResults) {
      // if they change answers after seeing results, hide results until resubmit
      setShowResults(false);
      setScore(null);
    }
  };

  const handleQuizSubmit = () => {
    if (quiz.length === 0) return;

    let correctCount = 0;
    quiz.forEach((q, i) => {
      if (selectedAnswers[i] === q.correctIndex) {
        correctCount += 1;
      }
    });

    setScore(correctCount);
    setShowResults(true);
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.8rem", marginBottom: "1rem" }}>
        🎧 Study Buddy – AI Recording Helper
      </h1>
      <p style={{ marginBottom: "1rem" }}>
        Upload a lecture or meeting recording. I&apos;ll (eventually) transcribe
        it, summarize it, and make a quiz to help you study.
      </p>

      {/* Upload + Analyze form */}
      <form onSubmit={handleAnalyze} style={{ marginBottom: "1.5rem" }}>
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          style={{ marginBottom: "0.75rem", display: "block" }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          {loading ? "Analyzing..." : "Analyze Recording"}
        </button>
      </form>

      {error && (
        <div
          style={{
            background: "#fde2e1",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {summary && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid #ddd",
          }}
        >
          <h2 style={{ marginBottom: "0.5rem" }}>Summary</h2>
          <p>{summary}</p>
        </div>
      )}

      {quiz.length > 0 && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid #ddd",
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ marginBottom: "0.75rem" }}>Quiz</h2>

          {quiz.map((q, i) => (
            <div
              key={i}
              style={{
                marginBottom: "1rem",
                paddingBottom: "0.75rem",
                borderBottom: "1px solid #eee",
              }}
            >
              <p style={{ fontWeight: "600", marginBottom: "0.5rem" }}>
                {i + 1}. {q.question}
              </p>
              <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                {q.options.map((opt, idx) => {
                  const isSelected = selectedAnswers[i] === idx;
                  const isCorrect = q.correctIndex === idx;

                  let textStyle = {};
                  if (showResults) {
                    if (isCorrect) {
                      textStyle = { fontWeight: "700", color: "green" };
                    } else if (isSelected && !isCorrect) {
                      textStyle = { color: "red" };
                    }
                  }

                  return (
                    <li key={idx} style={{ marginBottom: "0.25rem" }}>
                      <label style={{ cursor: "pointer", ...textStyle }}>
                        <input
                          type="radio"
                          name={`q-${i}`}
                          value={idx}
                          disabled={false}
                          checked={isSelected || false}
                          onChange={() =>
                            handleOptionChange(i, idx)
                          }
                          style={{ marginRight: "0.35rem" }}
                        />
                        {opt}
                        {showResults && isCorrect && "  ✅"}
                        {showResults && isSelected && !isCorrect && "  ❌"}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <button
            type="button"
            onClick={handleQuizSubmit}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              marginTop: "0.5rem",
            }}
          >
            Check Answers
          </button>

          {showResults && score !== null && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "#f3f4ff",
              }}
            >
              You got {score} out of {quiz.length} correct.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
