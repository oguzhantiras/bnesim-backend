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
async function bnesimGetActivationStatus(activationTransaction) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/activation-transaction/get-status`;

  const form = new FormData();
  form.append("activationTransaction", String(activationTransaction));

  const res = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (res.status !== 200) throw new Error(`Get status failed: ${res.status}`);
  return res.data; // { success, activation_status, license_cli? ...}
}

async function waitForOkStatus(activationTransaction, { tries = 8, delayMs = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const data = await bnesimGetActivationStatus(activationTransaction);
    const status = data?.activation_status;

    if (status === "OK") return data;
    if (status === "FAILED") throw new Error(`Activation FAILED: ${JSON.stringify(data)}`);

    // PENDING veya başka -> bekle
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Activation status OK olmadı (timeout/poll bitti)");
}

async function bnesimCreateLicense({ name, email, phone }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/license/activation`;

  const form = new FormData();
  form.append("name", name);
  if (email) form.append("email", email);
  if (phone) form.append("phonenumber", phone);

  const res = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (res.status !== 200) throw new Error(`License activation failed: ${res.status}`);
  if (!res.data?.activationTransaction) throw new Error("activationTransaction yok (license)");

  return res.data.activationTransaction;
}

async function bnesimAddEsim({ licenseCli, productId, scheduledActivationDate }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/simcard/add-esim`;

  const form = new FormData();
  form.append("license_cli", String(licenseCli));
  form.append("product_id", String(productId));
  if (scheduledActivationDate) form.append("scheduled_activation_date", scheduledActivationDate);

  const res = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (res.status !== 200) throw new Error(`add-esim failed: ${res.status}`);
  if (!res.data?.activationTransaction) throw new Error("activationTransaction yok (esim)");

  return res.data.activationTransaction;
}

async function bnesimGetSimcardDetail({ iccid, withProducts = 0 }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/simcard/get-detail`;

  const form = new FormData();
  form.append("iccid", String(iccid));
  form.append("with_products", String(withProducts));

  const res = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (res.status !== 200) throw new Error(`Simcard detail failed: ${res.status}`);
  return res.data;
}

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

