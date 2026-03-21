let userRequests = {};

const express = require("express");
const router = express.Router();
const { handleChat, getChatHealth } = require("./chat.service");

router.post("/", async (req, res) => {
  const ip = (
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""
  ).split(",")[0].trim();

  const now = Date.now();

  if (!userRequests[ip]) {
    userRequests[ip] = { count: 1, time: now };
  } else {
    if (now - userRequests[ip].time < 60000) {
      if (userRequests[ip].count >= 10) {
        return res.status(429).json({ error: "Çok hızlı yazıyorsun" });
      }
      userRequests[ip].count++;
    } else {
      userRequests[ip] = { count: 1, time: now };
    }
  }

  // temizleme
  setTimeout(() => {
    delete userRequests[ip];
  }, 5 * 60 * 1000);

  try {
    const result = await handleChat(req.body.messages);
    res.json(result);
  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: "chat error" });
  }
});

router.get("/health", (req, res) => {
  res.json(getChatHealth());
});

module.exports = router;
