require("dotenv").config();

const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");
const FormData = require("form-data");

const app = express();
app.use(express.json());

// --- basic routes ---
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

// --- BNESIM token cache ---
let BNESIM_TOKEN_CACHE = { token: null, expMs: 0 };

function decodeJwtExpMs(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8")
    );
    return payload.exp ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function bnesimLoginOperator() {
  const base = process.env.BNESIM_BASE_URL;
  if (!base) throw new Error("BNESIM_BASE_URL env yok");
  if (!process.env.BNESIM_API_KEY) throw new Error("BNESIM_API_KEY env yok");
  if (!process.env.BNESIM_API_SECRET) throw new Error("BNESIM_API_SECRET env yok");

  const url = `${base}/v2.0/login`;

  const form = new FormData();
  form.append("api_key", process.env.BNESIM_API_KEY);
  form.append("api_secret", process.env.BNESIM_API_SECRET);
  form.append("type", "operator");

  const res = await axios.post(url, form, {
    headers: { accept: "application/json", ...form.getHeaders() },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (res.status !== 200) {
    throw new Error(`BNESIM login failed: ${res.status}`);
  }
  if (!res.data?.token) {
    throw new Error("BNESIM token yok");
  }
  return res.data.token;
}

async function getBnesimToken() {
  const now = Date.now();
  if (BNESIM_TOKEN_CACHE.token && BNESIM_TOKEN_CACHE.expMs - 60000 > now) {
    return BNESIM_TOKEN_CACHE.token;
  }

  const token = await bnesimLoginOperator();
  const expMs = decodeJwtExpMs(token);
  BNESIM_TOKEN_CACHE = { token, expMs };
  return token;
}

// --- BNESIM login test ---
app.get("/bnesim/login-test", async (req, res) => {
  try {
    const token = await getBnesimToken();
    res.json({ ok: true, token: "***" }); // token'ı dışarıya dökmeyelim
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- MOCK: create eSIM (sonra gerçek endpoint ile değişecek) ---
async function bnesimCreateEsim({ planCode, customerEmail }) {
  // token alıyoruz (cache ile)
  await getBnesimToken();

  // şimdilik MOCK
  return {
    lpaString: "LPA:1$SMDP.EXAMPLE.COM$ACTIVATIONCODE-EXAMPLE",
    iccid: "8988xxxxxxxxxxxxxxx",
  };
}

// --- create + qr endpoint ---
app.post("/create-and-qr", async (req, res) => {
  try {
    const { planCode, customerEmail } = req.body || {};
    if (!planCode) return res.status(400).json({ ok: false, error: "planCode gerekli" });
    if (!customerEmail) return res.status(400).json({ ok: false, error: "customerEmail gerekli" });

    const esim = await bnesimCreateEsim({ planCode, customerEmail });

    const qrPngDataUrl = await QRCode.toDataURL(esim.lpaString);
    const base64 = qrPngDataUrl.split(",")[1];

    res.json({
      ok: true,
      iccid: esim.iccid,
      lpaString: esim.lpaString,
      qrPngBase64: base64,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));

