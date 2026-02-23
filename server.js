require("dotenv").config();

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
app.use(express.json());

// --- CORS (şimdilik açık; canlıda domain ile kısıtla) ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- basic routes ---
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

// =====================
// BNESIM TOKEN CACHE
// =====================
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

  if (res.status !== 200) throw new Error(`BNESIM login failed: ${res.status}`);
  if (!res.data?.token) throw new Error("BNESIM token yok");

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// =====================
// BNESIM API HELPERS
// =====================
async function bnesimGetRegionsCountries() {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/products/get-regions-countries`;

  const r = await axios.get(url, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`regions-countries failed: ${r.status}`);
  return r.data;
}

async function bnesimGetProducts(area) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/products/get-products`;

  const form = new FormData();
  if (area) form.append("area", area);

  const r = await axios.post(url, form, {
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...form.getHeaders() },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`get-products failed: ${r.status}`);
  return r.data;
}

async function bnesimLicenseActivation({ name, email, phonenumber }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/license/activation`;

  const form = new FormData();
  form.append("name", name);
  if (email) form.append("email", email);
  if (phonenumber) form.append("phonenumber", phonenumber);

  const r = await axios.post(url, form, {
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...form.getHeaders() },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`license activation failed: ${r.status}`);
  const tx = r.data?.activationTransaction;
  if (!tx) throw new Error("activationTransaction gelmedi (license)");
  return tx;
}

async function bnesimActivationTxStatus(activationTransaction) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/activation-transaction/get-status`;

  const form = new FormData();
  form.append("activationTransaction", String(activationTransaction));

  const r = await axios.post(url, form, {
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...form.getHeaders() },
    timeout: 20000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`get-status failed: ${r.status}`);
  return r.data; // { success, activation_status, license_cli?, ... }
}

async function bnesimAddEsim({ license_cli, product_id }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/simcard/add-esim`;

  const form = new FormData();
  form.append("license_cli", String(license_cli));
  form.append("product_id", String(product_id));

  const r = await axios.post(url, form, {
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...form.getHeaders() },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`add-esim failed: ${r.status}`);
  const tx = r.data?.activationTransaction;
  if (!tx) throw new Error("activationTransaction gelmedi (add-esim)");
  return { tx, raw: r.data };
}

async function bnesimSimcardDetail({ iccid, with_products = 0 }) {
  const token = await getBnesimToken();
  const url = `${process.env.BNESIM_BASE_URL}/v2.0/enterprise/simcard/get-detail`;

  const form = new FormData();
  form.append("iccid", String(iccid));
  form.append("with_products", String(with_products));

  const r = await axios.post(url, form, {
    headers: { accept: "application/json", authorization: `Bearer ${token}`, ...form.getHeaders() },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (r.status !== 200) throw new Error(`simcard detail failed: ${r.status}`);
  return r.data;
}

// =====================
// ROUTES
// =====================
async function getProductsNormalized(area) {
  const raw = await bnesimGetProducts(area);
  const products = (raw?.products || []).map((p) => ({
    id: String(p.id),
    name: p.name,
    price: Number(p.price),
    currency: p.currency || "EUR",
    volumeMB: Number(p.volume),
    durationDays: Number(p.duration),
    region: p.region_names || p.region || "",
    sku: p.sku || "",
    validity_label: p.validity_label || "",
  }));
  return { raw, products };
}

// ✅ Senin frontend'in kullandığı eski endpoint
app.get("/bnesim/products-test", async (req, res) => {
  try {
    const area = (req.query.area || "TR").toString();
    const { products } = await getProductsNormalized(area);
    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ Eğer bir yerlerde bunu da çağırıyorsan (eski kodunda vardı)
app.get("/api/products", async (req, res) => {
  try {
    const area = (req.query.area || "TR").toString().toUpperCase();
    const { products } = await getProductsNormalized(area);
    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ Yeni isim (istersen kullanırsın)
app.get("/bnesim/products", async (req, res) => {
  try {
    const area = (req.query.area || "TR").toString();
    const { products } = await getProductsNormalized(area);
    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.get("/bnesim/regions-countries", async (req, res) => {
  try {
    const raw = await bnesimGetRegionsCountries();

    const areas = raw?.areas || [];
    // Hem region hem country için güvenli map:
    const cleaned = areas
      .map((a) => ({
        name: a.country_name || a.name || a.region_name || a.region || "",
        code: a.country_iso2 || a.code || a.countryCode || "",
      }))
      .filter((x) => x.name && x.code);

    res.json({ ok: true, count: cleaned.length, areas: cleaned });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Products (area paramıyla)
app.get("/bnesim/products", async (req, res) => {
  try {
    const area = (req.query.area || "TR").toString();

    const raw = await bnesimGetProducts(area);
    const products = (raw?.products || []).map((p) => ({
      id: String(p.id),
      name: p.name,
      price: Number(p.price),
      currency: p.currency || "EUR",
      volumeMB: Number(p.volume),
      durationDays: Number(p.duration),
      region: p.region_names || "",
      sku: p.sku || "",
      validity_label: p.validity_label || "",
    }));

    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// License test (GET)
app.get("/bnesim/license-test", async (req, res) => {
  try {
    const name = req.query.name || "Test User";
    const email = req.query.email || "";
    const phonenumber = req.query.phonenumber || "";

    const activationTransaction = await bnesimLicenseActivation({ name, email, phonenumber });

    let last = null;
    for (let i = 0; i < 8; i++) {
      last = await bnesimActivationTxStatus(activationTransaction);
      const st = last?.activation_status;
      if (st === "OK" || st === "FAILED") break;
      await sleep(1500);
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

// eSIM detail from tx (GET)
app.get("/bnesim/esim-detail-from-tx", async (req, res) => {
  try {
    const activationTransaction = req.query.activationTransaction;
    if (!activationTransaction) {
      return res.status(400).json({ ok: false, error: "activationTransaction query yok" });
    }

    let last = null;
    for (let i = 0; i < 12; i++) {
      last = await bnesimActivationTxStatus(activationTransaction);
      const st = last?.activation_status;
      if (st === "OK" || st === "FAILED") break;
      await sleep(1500);
    }

    if (!last) throw new Error("status gelmedi");
    if (last.activation_status !== "OK") {
      return res.json({ ok: false, activation_status: last.activation_status, rawStatus: last });
    }

    const iccid =
      last.iccid ||
      last.simcard_iccid ||
      last.simcard_details?.iccid ||
      null;

    if (!iccid) {
      return res.json({
        ok: false,
        activation_status: "OK",
        error: "Status OK ama ICCID yok. rawStatus'a bak.",
        rawStatus: last,
      });
    }

    const detail = await bnesimSimcardDetail({ iccid, with_products: 0 });
    const sim =
      detail?.simcardDetails ||
      detail?.data?.simcardDetails ||
      detail?.data?.simcard_details ||
      null;

    res.json({
      ok: true,
      activationTransaction,
      iccid,
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

// Tek endpoint: License + eSIM + Detail (POST)  ✅ senin asıl işin
app.post("/create-and-qr", async (req, res) => {
  try {
    const { product_id, customerEmail, name, phone } = req.body || {};
    if (!product_id) return res.status(400).json({ ok: false, error: "product_id yok" });
    if (!customerEmail) return res.status(400).json({ ok: false, error: "customerEmail yok" });

    // 1) License activation
    const licenseTx = await bnesimLicenseActivation({
      name: name || customerEmail,
      email: customerEmail,
      phonenumber: phone || "",
    });

    // 2) License status -> license_cli
    let st1 = null;
    for (let i = 0; i < 12; i++) {
      st1 = await bnesimActivationTxStatus(licenseTx);
      const st = st1?.activation_status;
      if (st === "OK" || st === "FAILED") break;
      await sleep(1500);
    }

    if (st1?.activation_status !== "OK" || !st1?.license_cli) {
      return res.status(500).json({ ok: false, step: "license_status", raw: st1 });
    }

    const license_cli = st1.license_cli;

    // 3) Add eSIM
    const { tx: esimTx, raw: esimRaw } = await bnesimAddEsim({
      license_cli,
      product_id,
    });

    // 4) eSIM status -> OK
    let st2 = null;
    for (let i = 0; i < 16; i++) {
      st2 = await bnesimActivationTxStatus(esimTx);
      const st = st2?.activation_status;
      if (st === "OK" || st === "FAILED") break;
      await sleep(1500);
    }

    if (st2?.activation_status !== "OK") {
      return res.status(500).json({ ok: false, step: "esim_status", raw: st2, esimRaw });
    }

    const iccid =
      st2?.iccid ||
      st2?.simcard_iccid ||
      st2?.simcard_details?.iccid ||
      null;

    if (!iccid) {
      return res.status(500).json({ ok: false, step: "iccid", error: "ICCID yok", raw: st2, esimRaw });
    }

    // 5) Simcard detail
    const detail = await bnesimSimcardDetail({ iccid, with_products: 0 });
    const sim =
      detail?.simcardDetails ||
      detail?.data?.simcardDetails ||
      detail?.data?.simcard_details ||
      null;

    if (!sim) throw new Error("simcard detail parse edilemedi");

    return res.json({
      ok: true,
      customerEmail,
      product_id,
      license_cli,
      licenseActivationTransaction: licenseTx,
      esimActivationTransaction: esimTx,
      iccid,
      qr_code: sim.qr_code || null,
      qr_code_image: sim.qr_code_image || null,
      ios_universal_installation_link: sim.ios_universal_installation_link || null,
      matching_id: sim.matching_id || null,
      smdp_address: sim.smdp_address || null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
// ===============================
// SHOPIFY - ORDER PAID WEBHOOK
// ===============================
app.post("/webhooks/order-paid", async (req, res) => {
  try {
    const order = req.body;

    console.log("✅ ORDER PAID WEBHOOK GELDİ");
    console.log("Order ID:", order.id);
    console.log("Email:", order.email);

    // 1) Güvenlik için hemen 200 dön
    res.sendStatus(200);

    // 2) Gerekli alanları çek
    const customerEmail = order.email;
    if (!customerEmail) {
      console.error("❌ Email yok");
      return;
    }

    // 3) İlk ürünü al (şimdilik 1 eSIM varsayıyoruz)
    const item = order.line_items?.[0];
    if (!item) {
      console.error("❌ line_items boş");
      return;
    }

    const priceKey = item.variant_title || item.price; 
    console.log("Paket fiyat anahtarı:", priceKey);

    /**
     * 🔑 ÖNEMLİ:
     * priceKey (örnek: "24.99") → BNESIM product_id map’i
     */
    const PRICE_TO_PRODUCT = {
      "24.99": "86744",
      "149.99": "86745"
    };

    const product_id = PRICE_TO_PRODUCT[priceKey];
    if (!product_id) {
      console.error("❌ Bu fiyata karşılık product_id yok:", priceKey);
      return;
    }

    // ===============================
    // BNESIM FLOW
    // ===============================

    // A) License oluştur
    const licenseTx = await bnesimLicenseActivation({
      name: customerEmail,
      email: customerEmail
    });

    // B) License status → OK
    let licenseStatus;
    for (let i = 0; i < 10; i++) {
      licenseStatus = await bnesimActivationTxStatus(licenseTx);
      if (licenseStatus?.activation_status === "OK") break;
      await sleep(1500);
    }

    if (!licenseStatus?.license_cli) {
      console.error("❌ license_cli alınamadı");
      return;
    }

    const license_cli = licenseStatus.license_cli;

    // C) eSIM ekle
    const esim = await bnesimAddEsim({
      license_cli,
      product_id
    });

    // D) eSIM status
    let esimStatus;
    for (let i = 0; i < 10; i++) {
      esimStatus = await bnesimActivationTxStatus(esim.tx);
      if (esimStatus?.activation_status === "OK") break;
      await sleep(1500);
    }

    if (!esimStatus?.iccid && !esimStatus?.simcard_iccid) {
      console.error("❌ ICCID bulunamadı");
      return;
    }

    const iccid =
      esimStatus.iccid ||
      esimStatus.simcard_iccid ||
      esimStatus.simcard_details?.iccid;

    // E) Simcard detail → QR
    const detail = await bnesimSimcardDetail({ iccid, with_products: 0 });
    const sim =
      detail?.data?.simcard_details ||
      detail?.simcardDetails;

    console.log("🎉 eSIM OLUŞTU");
    console.log("ICCID:", iccid);
    console.log("QR:", sim?.qr_code || sim?.qr_code_image);

    // 🔜 BURADA MAIL ATACAĞIZ (bir sonraki adım)
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err.message);
    // Shopify tekrar denemesin diye yine 200 dönüyoruz
    res.sendStatus(200);
  }
});
// --- start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
