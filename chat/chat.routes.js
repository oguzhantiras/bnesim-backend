const express = require("express");
const router = express.Router();
const { handleChat, getChatHealth } = require("./chat.service");

router.post("/", async (req, res) => {
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
