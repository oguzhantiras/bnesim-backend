require("dotenv").config();

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
app.use(express.json());


// =====================
// QR STORE (RAM - geçici)
// =====================
const QR_STORE = new Map();

// Shopify order’dan doğru token’ı seç
function pickOrderToken(order) {
  return (order?.checkout_token || order?.token || "").toString();
}

// BNESIM qr_code_image bazen sadece dosya adı geliyor.
// full URL'ye çeviriyoruz.
function toBnesimQrUrl(qrCodeImage) {
  if (!qrCodeImage) return null;
  const s = String(qrCodeImage).trim();

  // zaten URL ise dokunma
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  // dosya adıysa full URL yap
  return `https://my.bnesim.com/assets/images/eSIM_QRCodes/${encodeURIComponent(s)}`;
}



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

// Thank you sayfası burayı çağıracak (JSON)
app.get("/public/qr", (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "token missing" });

    const data = QR_STORE.get(token);
    if (!data) return res.json({ ok: true, status: "PENDING" });

    // READY ise, frontende bizim proxy image endpointini veriyoruz
    const qr_proxy_image =
      data.status === "READY" ? `/public/qr-image?token=${encodeURIComponent(token)}` : null;

    return res.json({ ok: true, ...data, qr_proxy_image });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// QR PNG'yi BNESIM'den çekip bizim domainden servis eder (VPN derdi biter)
app.get("/public/qr-image", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).send("token missing");

    const data = QR_STORE.get(token);
    if (!data || data.status !== "READY") return res.status(404).send("not ready");

    const qrUrl = toBnesimQrUrl(data.qr_code_image);
    if (!qrUrl) return res.status(404).send("no qr image");

    const r = await axios.get(qrUrl, {
      responseType: "arraybuffer",
      timeout: 20000,
      validateStatus: () => true,
      headers: { accept: "image/*" },
    });

    if (r.status !== 200) return res.status(502).send("qr fetch failed");

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store"); // tek kullanımlık mantık
    return res.send(Buffer.from(r.data));
  } catch (e) {
    console.error("❌ qr-image proxy error:", e.message);
    return res.status(500).send("proxy error");
  }
});

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
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
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
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
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
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
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
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...form.getHeaders(),
    },
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

// =====================
// ROUTES
// =====================

// 1) Regions/Countries
app.get("/bnesim/regions-countries", async (req, res) => {
  try {
    const raw = await bnesimGetRegionsCountries();
    const areas = raw?.areas || [];

    // Hem region hem country için güvenli map
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

// 2) Products (frontend’in kullandığı endpoint) ✅
// Senin sayfa: `${API_BASE}/bnesim/products-test?area=...` diyordu.
// Biz burada /bnesim/products şeklinde doğru endpoint veriyoruz.
// Frontend’de URL’yi buna çevirirsen daha temiz olur.
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
      region: p.region_names || p.region || "",
      sku: p.sku || "",
      validity_label: p.validity_label || "",
    }));

    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 3) Eski endpoint (backward-compat) ✅
app.get("/bnesim/products-test", async (req, res) => {
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
      region: p.region_names || p.region || "",
      sku: p.sku || "",
      validity_label: p.validity_label || "",
    }));

    res.json({ ok: true, area, count: products.length, products });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 4) Tek endpoint: License + eSIM + Detail (POST) ✅ manuel test için
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
  // Shopify retry istemiyoruz
  res.sendStatus(200);

  try {
    const order = req.body;

    const orderToken = pickOrderToken(order);
    console.log("🧩 orderToken:", orderToken);

    if (orderToken) {
      QR_STORE.set(orderToken, { status: "PENDING", created_at: Date.now() });
    }

    console.log("✅ ORDER PAID WEBHOOK GELDİ");
    console.log("Order ID:", order?.id);
    console.log("Email:", order?.email);

    const customerEmail = order?.email;
    if (!customerEmail) {
      console.error("❌ Email yok");
      return;
    }

    // line items
    const items = Array.isArray(order?.line_items) ? order.line_items : [];
    if (!items.length) {
      console.error("❌ line_items boş");
      return;
    }

    function getPropValue(properties, key) {
      if (!properties) return "";
      if (!Array.isArray(properties) && typeof properties === "object") {
        return String(properties[key] || "").trim();
      }
      if (Array.isArray(properties)) {
        const found = properties.find((p) => String(p?.name).trim() === key);
        return String(found?.value || "").trim();
      }
      return "";
    }

    const item =
      items.find((li) => {
        const props = li?.properties;
        const v =
          getPropValue(props, "BNESIM Product") ||
          getPropValue(props, "BNESIM Product ID") ||
          getPropValue(props, "BNESIM_PRODUCT_ID") ||
          getPropValue(props, "_bnesim_product_id");
        return Boolean(v);
      }) || items[0];

    const props = item?.properties || [];

    const product_id =
      getPropValue(props, "BNESIM Product") ||
      getPropValue(props, "BNESIM Product ID") ||
      getPropValue(props, "BNESIM_PRODUCT_ID") ||
      getPropValue(props, "_bnesim_product_id");

    if (!product_id) {
      console.error("❌ BNESIM product_id yok", props);
      return;
    }

    console.log("🎯 BNESIM product_id:", product_id);

    // A) License
    const licenseTx = await bnesimLicenseActivation({
      name: customerEmail,
      email: customerEmail,
    });

    let licenseStatus;
    for (let i = 0; i < 10; i++) {
      licenseStatus = await bnesimActivationTxStatus(licenseTx);
      if (licenseStatus?.activation_status === "OK") break;
      await sleep(1500);
    }

    if (!licenseStatus?.license_cli) {
      console.error("❌ license_cli alınamadı", licenseStatus);
      return;
    }

    const license_cli = licenseStatus.license_cli;

    // B) eSIM satın al
    const esim = await bnesimAddEsim({ license_cli, product_id });

    let esimStatus;
    for (let i = 0; i < 12; i++) {
      esimStatus = await bnesimActivationTxStatus(esim.tx);
      if (esimStatus?.activation_status === "OK") break;
      await sleep(1500);
    }

    if (esimStatus?.activation_status !== "OK") {
      console.error("❌ eSIM activation failed", esimStatus);
      return;
    }

    const iccid =
      esimStatus?.iccid ||
      esimStatus?.simcard_iccid ||
      esimStatus?.simcard_details?.iccid;

    if (!iccid) {
      console.error("❌ ICCID yok", esimStatus);
      return;
    }

    // C) Simcard detail (ASIL ÖNEMLİ KISIM)
    const detail = await bnesimSimcardDetail({ iccid, with_products: 0 });
    const sim = detail?.data?.simcard_details;

    if (!sim) {
      console.error("❌ simcard_details yok", detail);
      return;
    }

    console.log("🎉 eSIM OLUŞTU");
    console.log("ICCID:", iccid);
    console.log("QR STRING (LPA):", sim.qr_code);
    console.log("SMDP:", sim.smdp_address);
    console.log("MATCHING ID:", sim.matching_id);
    console.log("IOS LINK:", sim.ios_universal_installation_link);

    // D) STORE → PNG YOK, STRING VAR
    if (orderToken) {
      QR_STORE.set(orderToken, {
        status: "READY",

        // kimlik
        iccid,

        // QR üretmek için gereken ASIL DATA
        qr_code: sim.qr_code || null, // LPA STRING

        // manuel kurulum
        smdp_address: sim.smdp_address || null,
        matching_id: sim.matching_id || null,
        ios_universal_installation_link: sim.ios_universal_installation_link || null,

        updated_at: Date.now(),
      });

      console.log("✅ QR_STORE READY (STRING MODE):", orderToken);
    }
  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err);
    try {
      const orderToken = pickOrderToken(req.body);
      if (orderToken) {
        QR_STORE.set(orderToken, { status: "FAILED", updated_at: Date.now() });
      }
    } catch {}
  }
});
// --- start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`)); lutfen anla analız et ve nereye ne kod yapıstıracagımı soyle adım adım satır satır
