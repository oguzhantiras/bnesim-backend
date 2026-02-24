require("dotenv").config();

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");

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
function getSmtpTransporter(){
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";

  if(!host || !process.env.SMTP_USER || !process.env.SMTP_PASS){
    throw new Error("SMTP env eksik: SMTP_HOST/SMTP_USER/SMTP_PASS");
  }

  return nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  requireTLS: port === 587,     // STARTTLS'yi zorla
  tls: { rejectUnauthorized: false } // (test amaçlı) bazı TLS handshakeleri geçer
});
}

async function sendEsimEmail({ to, title, qrText, iosLink, smdp, matchingId }) {
  const transporter = getSmtpTransporter();

  // QRCode lib sende zaten var: const QRCode = require("qrcode");
  const qrPng = qrText
    ? await QRCode.toBuffer(qrText, { type: "png", width: 480, margin: 1 })
    : null;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const html = `
  <div style="font-family:Arial,sans-serif;line-height:1.45">
    <h2>eSIM’in hazır ✅</h2>
    <p><b>Paket:</b> ${escapeHtml(title || "")}</p>
    <p>Aşağıdaki QR kodu telefonundan “Hücresel Plan Ekle / Add eSIM” bölümünde okut.</p>

    ${qrPng ? `<p><img alt="eSIM QR" src="cid:esimqr" style="max-width:280px;border:1px solid #eee;border-radius:12px"/></p>` : ""}

    ${iosLink ? `<p><b>iPhone hızlı kurulum:</b> <a href="${iosLink}">${iosLink}</a></p>` : ""}
    ${smdp ? `<p><b>SM-DP+:</b> ${escapeHtml(smdp)}</p>` : ""}
    ${matchingId ? `<p><b>Matching ID:</b> ${escapeHtml(matchingId)}</p>` : ""}
    ${qrText ? `<p><b>QR / LPA metni:</b><br/><code>${escapeHtml(qrText)}</code></p>` : ""}

    <hr/>
    <p>Destek: ${escapeHtml(from)}</p>
  </div>`;

  const mail = {
    from,
    to,
    subject: "eSIM QR Kodun Hazır ✅",
    html,
    attachments: qrPng ? [{
      filename: "esim-qr.png",
      content: qrPng,
      cid: "esimqr"
    }] : []
  };

  await transporter.sendMail(mail);
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// tessssssssst
app.get("/test-email", async (req, res) => {
  try {
    const to = req.query.to || process.env.SMTP_USER;
    await sendEsimEmail({
      to,
      title: "TEST PAKET",
      qrText: "LPA:1$test.smdp.io$TESTMATCHING",
      iosLink: "https://example.com",
      smdp: "test.smdp.io",
      matchingId: "TESTMATCHING",
    });
    res.json({ ok: true, sentTo: to });
  } catch (e) {
    console.error("❌ TEST EMAIL ERROR:", e);
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
    console.log("Order ID:", order?.id);
    console.log("Email:", order?.email);

    // Shopify tekrar denemesin diye hızlıca 200
    res.sendStatus(200);

    const customerEmail = order?.email;
    if (!customerEmail) return console.error("❌ Email yok");

    const item = order?.line_items?.[0];
    if (!item) return console.error("❌ line_items boş");

    // ✅ Sepete eklerken gönderdiğin BNESIM Product buradan gelir
    const props = item?.properties || {};
    const product_id =
      props["BNESIM Product"] ||
      props["BNESIM Product ID"] ||
      props["BNESIM_PRODUCT_ID"] ||
      "";

    const title = props["Paket"] || item?.title || item?.name || "";

    if (!product_id) {
      console.error("❌ BNESIM product_id yok. line_item.properties içinde BNESIM Product olmalı.", props);
      return;
    }

    console.log("🎯 BNESIM product_id:", product_id);

    // A) License oluştur
    const licenseTx = await bnesimLicenseActivation({
      name: customerEmail,
      email: customerEmail
    });

    // B) License status → OK
    let licenseStatus = null;
    for (let i = 0; i < 10; i++) {
      licenseStatus = await bnesimActivationTxStatus(licenseTx);
      if (licenseStatus?.activation_status === "OK" || licenseStatus?.activation_status === "FAILED") break;
      await sleep(1500);
    }

    if (licenseStatus?.activation_status !== "OK" || !licenseStatus?.license_cli) {
      console.error("❌ license_cli alınamadı", licenseStatus);
      return;
    }

    const license_cli = licenseStatus.license_cli;

    // C) eSIM ekle
    const esim = await bnesimAddEsim({ license_cli, product_id });

    // D) eSIM status
    let esimStatus = null;
    for (let i = 0; i < 12; i++) {
      esimStatus = await bnesimActivationTxStatus(esim.tx);
      if (esimStatus?.activation_status === "OK" || esimStatus?.activation_status === "FAILED") break;
      await sleep(1500);
    }

    if (esimStatus?.activation_status !== "OK") {
      console.error("❌ eSIM activation OK değil", esimStatus);
      return;
    }

    const iccid =
      esimStatus?.iccid ||
      esimStatus?.simcard_iccid ||
      esimStatus?.simcard_details?.iccid ||
      null;

    if (!iccid) {
      console.error("❌ ICCID bulunamadı", esimStatus);
      return;
    }

    // E) Simcard detail → QR
    const detail = await bnesimSimcardDetail({ iccid, with_products: 0 });
    const sim =
      detail?.data?.simcard_details ||
      detail?.simcardDetails ||
      detail?.data?.simcardDetails ||
      null;

    const qrText = sim?.qr_code || null;
    const iosLink = sim?.ios_universal_installation_link || null;
    const smdp = sim?.smdp_address || null;
    const matchingId = sim?.matching_id || null;

    console.log("🎉 eSIM OLUŞTU | ICCID:", iccid);

    // ✅ Mail gönder
    await sendEsimEmail({
      to: customerEmail,
      title,
      qrText,
      iosLink,
      smdp,
      matchingId
    });

    console.log("📩 Mail gönderildi:", customerEmail);

  } catch (err) {
    console.error("❌ WEBHOOK ERROR:", err.message);
    // Shopify retry istemiyoruz
    try { res.sendStatus(200); } catch {}
  }
});
// --- start ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
