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
app.get("/bnesim/products-test", async (req, res) => {
  try {
    const area = req.query.area || "TR";
    const token = await getBnesimToken();

    const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/products/get-products`;
    const form = new FormData();
    form.append("area", area);

    const r = await axios.post(url, form, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (r.status !== 200) {
      return res.status(500).json({ ok: false, status: r.status, data: r.data });
    }

    const products = (r.data?.products || []).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      volumeMB: p.volume,
      durationDays: p.duration,
      region: p.region_names,
      sku: p.sku,
    }));

    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function bnesimLicenseActivation({ name, email, phonenumber }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/license/activation`;

  const form = new FormData();
  form.append("name", name);
  if (email) form.append("email", email);
  if (phonenumber) form.append("phonenumber", phonenumber);

  const r = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (r.status !== 200) {
    throw new Error(`license activation failed: ${r.status}`);
  }
  const tx = r.data?.activationTransaction;
  if (!tx) throw new Error("activationTransaction gelmedi");
  return tx;
}

async function bnesimActivationTxStatus(activationTransaction) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/activation-transaction/get-status`;

  const form = new FormData();
  form.append("activationTransaction", String(activationTransaction));

  const r = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (r.status !== 200) {
    throw new Error(`get-status failed: ${r.status}`);
  }
  return r.data;
}

// Browser’dan test kolay olsun diye GET yaptım
app.get("/bnesim/license-test", async (req, res) => {
  try {
    const name = req.query.name || "Test User";
    const email = req.query.email || "";
    const phonenumber = req.query.phonenumber || "";

    const activationTransaction = await bnesimLicenseActivation({ name, email, phonenumber });

    // 6 kez dene (toplam ~12 sn)
    let last = null;
    for (let i = 0; i < 6; i++) {
      last = await bnesimActivationTxStatus(activationTransaction);
      const status = last?.activation_status;
      if (status === "OK") break;
      if (status === "FAILED") break;
      await sleep(2000);
    }

    res.json({
      ok: true,
      activationTransaction,
      activation_status: last?.activation_status || null,
      license_cli: last?.license_cli || null,
      raw: last,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
async function bnesimAddEsim({ license_cli, product_id }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/simcard/add-esim`;

  const form = new FormData();
  form.append("license_cli", String(license_cli));
  form.append("product_id", String(product_id));

  const r = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (r.status !== 200) {
    throw new Error(`add-esim failed: ${r.status}`);
  }

  const tx = r.data?.activationTransaction;
  if (!tx) throw new Error("add-esim activationTransaction gelmedi");
  return { tx, raw: r.data };
}

// Browser’dan test kolay olsun diye GET
app.get("/bnesim/add-esim-test", async (req, res) => {
  try {
    const license_cli = req.query.license_cli;
    const product_id = req.query.product_id;

    if (!license_cli) return res.status(400).json({ ok: false, error: "license_cli query yok" });
    if (!product_id) return res.status(400).json({ ok: false, error: "product_id query yok" });

    const out = await bnesimAddEsim({ license_cli, product_id });

    res.json({
      ok: true,
      license_cli,
      product_id,
      activationTransaction: out.tx,
      raw: out.raw,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
async function bnesimSimcardDetail({ iccid, with_products = 0 }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/simcard/get-detail`;

  const form = new FormData();
  form.append("iccid", String(iccid));
  form.append("with_products", String(with_products));

  const r = await axios.post(url, form, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`simcard detail failed: ${r.status}`);
  return r.data;
}

// 1) activationTransaction -> status OK olunca license_cli + (çoğu hesapta) iccid gibi bilgi döner
// 2) iccid ile simcard detail çekip QR datasını alır
app.get("/bnesim/esim-detail-from-tx", async (req, res) => {
  try {
    const activationTransaction = req.query.activationTransaction;
    if (!activationTransaction)
      return res.status(400).json({ ok: false, error: "activationTransaction query yok" });

    // OK olana kadar dene (max ~20 sn)
    let last = null;
    for (let i = 0; i < 10; i++) {
      last = await bnesimActivationTxStatus(activationTransaction);
      const status = last?.activation_status;
      if (status === "OK" || status === "FAILED") break;
      await sleep(2000);
    }

    if (!last) throw new Error("status gelmedi");
    if (last.activation_status !== "OK") {
      return res.json({ ok: false, activation_status: last.activation_status, rawStatus: last });
    }

    // BNESIM bazı hesaplarda burada direkt iccid verir, bazıları vermez.
    const iccid =
      last.iccid ||
      last.simcard_iccid ||
      last.simcard_details?.iccid ||
      null;

    if (!iccid) {
      return res.json({
        ok: false,
        activation_status: "OK",
        error: "Status OK ama ICCID bu response içinde yok (hesap farklı olabilir). rawStatus'a bak.",
        rawStatus: last,
      });
    }

    const detail = await bnesimSimcardDetail({ iccid, with_products: 0 });

    const sim = detail?.data?.simcard_details || null;

    res.json({
      ok: true,
      activationTransaction,
      iccid,
      // QR için işe yarayan alanlar (hangisi doluysa onu kullanacağız)
      qr_code: sim?.qr_code || null,
      qr_code_image: sim?.qr_code_image || null,
      smdp_address: sim?.smdp_address || null,
      ios_universal_installation_link: sim?.ios_universal_installation_link || null,
      matching_id: sim?.matching_id || null,
      rawDetail: detail,
    });
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
    const { customerEmail } = req.body || {};
    if (!customerEmail) return res.status(400).json({ ok: false, error: "customerEmail gerekli" });

    const productId = process.env.BNESIM_PRODUCT_ID;
    if (!productId) return res.status(500).json({ ok: false, error: "BNESIM_PRODUCT_ID env yok" });

    // 1) license oluştur
    const licenseTx = await bnesimCreateLicense({
      name: customerEmail,
      email: customerEmail,
    });

    // 2) license status OK -> license_cli al
    const licenseStatus = await waitForOkStatus(licenseTx);
    const licenseCli = licenseStatus?.license_cli;
    if (!licenseCli) throw new Error("license_cli gelmedi");

    // 3) eSIM satın al/ata
    const esimTx = await bnesimAddEsim({
      licenseCli,
      productId,
    });

    // 4) eSIM status OK (bu OK gelince genelde simcard iccid/cli vs çıkabilir, ama dokümanda yok)
    const esimStatus = await waitForOkStatus(esimTx);

    // ⚠️ Burada genelde iccid lazım. Bazı sistemler status response’a iccid ekler, bazısı eklemez.
    // Eğer esimStatus içinde iccid varsa onu kullanacağız:
    const iccid = esimStatus?.iccid || esimStatus?.simcard_iccid || null;

    if (!iccid) {
      // Şimdilik net alan adı dokümanda olmadığı için burada durduruyoruz:
      return res.status(500).json({
        ok: false,
        error: "eSIM OK oldu ama iccid status içinde gelmedi. Status response içindeki iccid alanını bulmam lazım.",
        esimStatus,
      });
    }

    // 5) Simcard detail -> QR
    const detail = await bnesimGetSimcardDetail({ iccid, withProducts: 0 });
    const sim = detail?.data?.simcard_details;

    const lpaString = sim?.qr_code || sim?.ios_universal_installation_link;
    if (!lpaString) throw new Error("Simcard detail içinde qr_code/lpa yok");

    const qrPngDataUrl = await QRCode.toDataURL(lpaString);
    const base64 = qrPngDataUrl.split(",")[1];

    res.json({
      ok: true,
      iccid: sim?.iccid || iccid,
      lpaString,
      qrPngBase64: base64,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));

