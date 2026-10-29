import express from "express";
import cors from "cors";

const app = express();
app.use(express.json({ limit: "20kb" }));

const allowedOrigin = process.env.FRONTEND_URL;
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigin || origin === allowedOrigin) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed"));
  }
}));

app.get("/", (_req, res) => {
  res.json({ name: "Nova AI API", status: "online" });
});

app.post("/api/chat", async (req, res) => {
  try {
    const question = req.body?.message;
    if (typeof question !== "string" || !question.trim() || question.length > 8000) {
      return res.status(400).json({ error: "Сообщение пустое или слишком длинное." });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "API-ключ не настроен на сервере." });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "Ты Nova AI — полезный, дружелюбный ИИ-помощник. Отвечай на русском, если пользователь пишет по-русски. Объясняй понятно." }]
          },
          contents: [{ role: "user", parts: [{ text: question.trim() }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data?.error?.message);
      return res.status(502).json({
        error: "ИИ временно не ответил. Проверь доступ к API и лимиты."
      });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "").join("").trim();

    if (!answer) {
      return res.status(502).json({ error: "ИИ вернул пустой ответ. Попробуй ещё раз." });
    }

    return res.json({ answer });
  } catch (error) {
    console.error("Chat request failed:", error.message);
    return res.status(500).json({ error: "Ошибка сервера. Попробуй ещё раз." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Nova AI server running on port ${port}`);
});
