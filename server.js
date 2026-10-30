
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;
const FRONTEND_URL = (process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.7";

app.disable("x-powered-by");

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === FRONTEND_URL) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "40kb" }));

app.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    name: "Nova AI API",
    status: "online",
    provider: "Grok",
    model: XAI_MODEL,
    keyConfigured: Boolean(XAI_API_KEY)
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", provider: "Grok" });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!XAI_API_KEY) {
      return res.status(500).json({
        error: "Не задан XAI_API_KEY в настройках Render."
      });
    }

    let incoming = [];

    if (Array.isArray(req.body?.messages)) {
      incoming = req.body.messages;
    } else if (typeof req.body?.message === "string") {
      incoming = [{
        role: "user",
        content: req.body.message
      }];
    }

    const messages = incoming
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string"
      )
      .slice(-12)
      .map(item => ({
        role: item.role,
        content: item.content.trim().slice(0, 4000)
      }))
      .filter(item => item.content.length > 0);

    if (
      !messages.length ||
      messages[messages.length - 1].role !== "user"
    ) {
      return res.status(400).json({
        error: "Напиши сообщение."
      });
    }

    const input = [
      {
        role: "system",
        content: "Ты Nova AI — дружелюбный и полезный ИИ-помощник. Отвечай на языке пользователя. Если пользователь пишет по-русски, отвечай по-русски. Помогай с учёбой, программированием, идеями и творчеством. Объясняй понятно."
      },
      ...messages
    ];

    const response = await fetch(
      "https://api.x.ai/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${XAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: XAI_MODEL,
          input,
          max_output_tokens: 1400,
          store: false
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerMessage =
        data?.error?.message || data?.message || "";

      console.error(
        "Grok API error:",
        response.status,
        providerMessage
      );

      if (response.status === 401) {
        return res.status(502).json({
          error: "Grok отклонил API-ключ. Проверь XAI_API_KEY в Render."
        });
      }

      if ([402, 403].includes(response.status)) {
        return res.status(502).json({
          error: "Проверь доступ к Grok API и баланс/кредиты xAI."
        });
      }

      if (response.status === 429) {
        return res.status(502).json({
          error: "Превышен лимит запросов Grok. Попробуй позже."
        });
      }

      return res.status(502).json({
        error: `Ошибка Grok API: HTTP ${response.status}. Проверь Logs в Render.`
      });
    }

    const answer = (data.output || [])
      .flatMap(item =>
        Array.isArray(item.content) ? item.content : []
      )
      .filter(item =>
        item && (
          item.type === "output_text" ||
          typeof item.text === "string"
        )
      )
      .map(item => item.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      console.error(
        "Grok returned no text:",
        JSON.stringify(data).slice(0, 1000)
      );

      return res.status(502).json({
        error: "Grok не вернул текстовый ответ."
      });
    }

    res.set("Cache-Control", "no-store");

    return res.json({
      answer,
      provider: "Grok",
      model: data.model || XAI_MODEL
    });

  } catch (error) {
    console.error(
      "Nova AI error:",
      error?.message || error
    );

    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      return res.status(504).json({
        error: "Grok отвечает слишком долго. Попробуй ещё раз."
      });
    }

    return res.status(500).json({
      error: "Внутренняя ошибка сервера Nova AI."
    });
  }
});

app.use((error, _req, res, _next) => {
  if (error?.message === "Origin not allowed") {
    return res.status(403).json({
      error: "Адрес сайта не разрешён. Проверь FRONTEND_URL в Render."
    });
  }

  if (error instanceof SyntaxError) {
    return res.status(400).json({
      error: "Некорректный JSON."
    });
  }

  console.error("Express error:", error?.message || error);

  return res.status(500).json({
    error: "Ошибка сервера."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Nova AI Grok server running on ${PORT}`);
  console.log(`Model: ${XAI_MODEL}`);
  console.log(`Frontend configured: ${Boolean(FRONTEND_URL)}`);
});
