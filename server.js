require("dotenv").config();

const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");
const FormData = require("form-data");

const app = express();
app.use(express.json());

async function bnesimLoginOperator() {
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/login`;

  const form = new FormData();
  form.append("api_key", process.env.BNESIM_API_KEY);
  form.append("api_secret", process.env.BNESIM_API_SECRET);
  form.append("type", "operator");

  console.log("BNESIM login ->", url);

  const res = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      ...form.getHeaders(),
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log("BNESIM status:", res.status);
  console.log("BNESIM data:", res.data);

  if (res.status !== 200) {
    throw new Error(`BNESIM login failed: ${res.status}`);
  }
  if (!res.data?.token) {
    throw new Error("BNESIM token yok");
  }

  return res.data.token;
}

app.get("/bnesim/login-test", async (req, res) => {
  try {
    const token = await bnesimLoginOperator();
    res.json({ ok: true, token });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.send("OK"));
app.listen(3000, () => {
  console.log("API listening on http://localhost:3000");
});

