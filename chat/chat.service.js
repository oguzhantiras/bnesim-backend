const fetch = require("node-fetch");

async function handleChat(messages) {
  return {
    reply: "chat çalışıyor",
    products: []
  };
}

function getChatHealth() {
  return {
    status: "ok"
  };
}

async function startChatCache() {
  console.log("chat cache başladı");
}

module.exports = {
  handleChat,
  getChatHealth,
  startChatCache
};
