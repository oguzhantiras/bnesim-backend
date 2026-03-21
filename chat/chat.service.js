const PAGE_CONFIG = [
  {
    key: "home",
    url: "https://oguzhantiras.com",
    title: "Ana Sayfa",
    keywords: ["oguzhan", "yırtıkpantolon", "yirtikpantolon", "kim", "hikaye", "genel"]
  },
  {
    key: "links",
    url: "https://oguzhantiras.com/pages/links",
    title: "Linkler",
    keywords: ["link", "sosyal medya", "youtube", "instagram", "tiktok", "facebook", "iletişim", "iletisim", "iş birliği", "is birligi", "medya"]
  },
  {
    key: "bio",
    url: "https://oguzhantiras.com/blogs/dunya-turu/yirtik-pantolon-oguzhan-tiras-kimdir",
    title: "Oğuzhan Kimdir",
    keywords: ["kimdir", "kim", "nereli", "üniversite", "universite", "eğitim", "egitim", "hayatı", "hayati", "biyografi", "kaç yaş", "kac yas"]
  },
  {
    key: "book",
    url: "https://oguzhantiras.com/products/yirtik-pantolon-kitap",
    title: "E-Kitap",
    keywords: ["e-kitap", "ekitap", "pdf kitap"]
  },
  {
    key: "signedBook",
    url: "https://oguzhantiras.com/products/yirtik-pantolon-imzali-kitap",
    title: "İmzalı Kitap",
    keywords: ["imzalı", "imzali kitap", "fiziksel kitap"]
  },
  {
    key: "course",
    url: "https://oguzhantiras.com/products/dunya-turuna-cikma-ve-icerik-uretme-kursu",
    title: "Kurs",
    keywords: ["kurs", "eğitim", "egitim", "içerik üretimi", "icerik uretimi", "video", "ders"]
  },
  {
    key: "esim",
    url: "https://oguzhantiras.com/yirtik-esim",
    title: "Yırtık eSIM",
    keywords: ["esim", "internet", "sim", "paket", "data", "bağlantı", "baglanti", "yurtdışı internet", "yurtdisi internet"]
  },
  {
    key: "resources",
    url: "https://oguzhantiras.com/pages/seyahat-kaynaklari-ve-uygulamalar",
    title: "Seyahat Kaynakları",
    keywords: ["uygulama", "uygulamalar", "kaynak", "seyahat", "ucuz uçak", "ucuz ucak", "hostel", "backpack", "gezi"]
  }
];

const PRODUCTS = {
  book: {
    id: "book",
    title: "Yırtık Pantolon'dan Hikayeler",
    url: "https://oguzhantiras.com/products/yirtik-pantolon-kitap",
    image: "https://cdn.shopify.com/s/files/1/0654/5404/7384/files/yirtikpantolonkitap.png?v=1718282910",
    subtitle: "E-kitap",
    buttonText: "İncele"
  },
  signedBook: {
    id: "signedBook",
    title: "Yırtık Pantolon İmzalı Kitap",
    url: "https://oguzhantiras.com/products/yirtik-pantolon-imzali-kitap",
    image: "https://cdn.shopify.com/s/files/1/0654/5404/7384/files/yirtikpantolonkitap.png?v=1718282910",
    subtitle: "İmzalı özel baskı",
    buttonText: "İncele"
  },
  course: {
    id: "course",
    title: "Dünya Turuna Çıkma ve İçerik Üretme Kursu",
    url: "https://oguzhantiras.com/products/dunya-turuna-cikma-ve-icerik-uretme-kursu",
    image: "https://cdn.shopify.com/s/files/1/0654/5404/7384/files/dunyaturuvesosyalmedyayaicerikuretmekursu.jpg?v=1722887581",
    subtitle: "Kurs",
    buttonText: "Kursa Git"
  },
  esim: {
    id: "esim",
    title: "Yırtık eSIM",
    url: "https://oguzhantiras.com/yirtik-esim",
    image: "https://cdn.shopify.com/s/files/1/0654/5404/7384/files/yirtikesimlogo.webp?v=1774052546",
    subtitle: "190+ ülke internet",
    buttonText: "eSIM'e Git"
  }
};

const BASE_RULES = `
Sen Oğuzhan Tıraş'ın (YırtıkPantolon) resmi AI asistanısın.

## TARZ
- Türkçe konuş
- Samimi, net ve doğal ol
- Gereksiz uzatma
- Uzun uzun anlatma, hızlı cevap ver

## FORMAT
**Başlık varsa kalın yaz**

Kısa açıklama (1-2 cümle)

• madde  
• madde  

- Tek paragraf yazma
- Cevaplar kısa ama TAM olsun
- Maksimum 5-6 satır hedefle
- Linkleri ayrı satırda ver

## BİLGİ KURALI
- Öncelikle verilen site içeriklerine dayan
- Emin olmadığın şeyi uydurma
- Çok temel konularda kısa açıklama yap
- Bilgi yoksa dürüst ol

## ÜRÜN DAVRANIŞI
- SADECE gerçekten alakalıysa ürün öner
- Ama fırsat varsa kaçırma
- Spam satış yapma

## ÜRÜN ETİKET KURALI (ÇOK ÖNEMLİ)
- Eğer ürün gerçekten ilgiliyse cevabın EN SONUNA ekle:

[PRODUCT: esim]
[PRODUCT: kitap]
[PRODUCT: signedBook]
[PRODUCT: kurs]

- Etiket sadece gerektiğinde
- Her zaman en sonda
- Ayrı satırda

## ÜRÜN TETİKLEME
- internet / eSIM / yurtdışı → esim
- kitap / hikaye → kitap
- para kazanma / içerik → kurs

## SATIŞ YÖNLENDİRME KURALI
- Kullanıcı seyahat, yurtdışı, bütçe, planlama soruyorsa:
  sadece bilgi verme → çözüm öner
- Uygun yerde eSIM’i doğal şekilde öner
- Kullanıcıyı aksiyona götür:
  • “En pratik çözüm bu”
  • “İstersen buradan bakabilirsin”

## SEYAHAT SORULARI ÖZEL KURAL
- Kullanıcı yurtdışı planlıyorsa:
  • internet ihtiyacını hatırlat
  • eSIM’i çözüm olarak öner
- Ama zorla satma, doğal bağla

## SATIŞ TONU
- Güven verici ol
- Net konuş
- “En kolay yol bu” gibi yönlendirici dil kullan

## KURULUM DESTEK KURALI
- Kurulum sorularında satış yapma
- Direkt yardımcı ol
- QR kodu her zaman ilk öner
- App’i sadece alternatif ver

## KURULUM CEVAP FORMATI

**Kurulum çok kolay 👇**

1. Mailde "Confirm email" bas  
2. QR kodu okut (en hızlı yol)  
3. eSIM’i aktif et  
4. Gerekirse VPN kullan  

Takıldığın yerde yaz 👍

## ÖZEL BİLGİLER
- Yırtık eSIM = BNESIM altyapısı
- Türkiye’de bazen VPN gerekebilir
- İade yoktur
- İmzalı kitap sadece Türkiye içi

Sosyal medya:

YouTube: https://www.youtube.com/@yirtikpantolon
Instagram: https://www.instagram.com/oguzhantiras
Facebook: https://www.facebook.com/yirtikoguz
TikTok: https://www.tiktok.com/@yirtikpantolon


Emin olmadığın hiçbir bilgiyi ekleme.
`;

const FALLBACK_PROMPT = `
${BASE_RULES}

Şu an ayrıntılı site içeriği hazır değil. Yine de kısa ve dürüst cevap ver.
`;

let pageCache = {};
let lastRefreshAt = null;
let refreshStarted = false;

function normalizeText(str = "") {
  return str
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanPageText(text) {
  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x.length > 20)
    .filter((x) => !/sepete ekle|cookie|gizlilik|privacy|navigation|menu|arama|search|hesabim|account/i.test(x));

  return lines.join("\n").slice(0, 1000);
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; YirtikPantolonBot/1.0)"
    }
  });

  if (!res.ok) {
    throw new Error(`Sayfa alınamadı: ${url} (${res.status})`);
  }

  const html = await res.text();
  const text = cleanPageText(extractText(html));
  return text;
}

async function refreshPages() {
  const nextCache = {};

  for (const page of PAGE_CONFIG) {
    try {
      const text = await fetchPage(page.url);
      nextCache[page.key] = {
        ...page,
        text
      };
      console.log(`OK: ${page.key}`);
    } catch (err) {
      console.error(`FAIL: ${page.key} -> ${err.message}`);
    }
  }

  if (Object.keys(nextCache).length > 0) {
    pageCache = nextCache;
    lastRefreshAt = new Date().toISOString();
    console.log("Site cache güncellendi.");
  }
}

function scorePage(question, page) {
  const q = normalizeText(question);
  let score = 0;

  for (const kw of page.keywords) {
    const k = normalizeText(kw);
    if (q.includes(k)) score += 3;
  }

  const pageText = normalizeText(page.text || "");
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);

  for (const word of qWords) {
    if (pageText.includes(word)) score += 1;
  }

  return score;
}

function getRelevantPages(question, limit = 3) {
  const pages = Object.values(pageCache);

  if (!pages.length) return [];

  const scored = pages
    .map((page) => ({ page, score: scorePage(question, page) }))
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((x) => x.score > 0).slice(0, limit).map((x) => x.page);

  if (top.length) return top;

  return scored.slice(0, 2).map((x) => x.page);
}

function buildSystemPrompt(question) {
  const relevantPages = getRelevantPages(question, 2);

  if (!relevantPages.length) {
    return FALLBACK_PROMPT;
  }

  const siteContext = relevantPages.map((page) => {
    return `### ${page.title}
URL: ${page.url}
İçerik:
${page.text}`;
  }).join("\n\n");

  return `
${BASE_RULES}

Aşağıda kullanıcının sorusuyla en alakalı site içerikleri var.
Cevabı öncelikle bunlara dayanarak ver.

${siteContext}
`;
}

async function handleChat(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error("Geçersiz istek");
    error.statusCode = 400;
    throw error;
  }

  const cleanMessages = messages.slice(-4).map((m) => ({
    role: m.role,
    content: m.content
  }));

  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";

  const systemPrompt = buildSystemPrompt(lastUserMessage);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: cleanMessages
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("ANTHROPIC ERROR:", data);
    const error = new Error(data?.error?.message || "Anthropic hatası");
    error.statusCode = response.status;
    throw error;
  }

  const rawReply = data?.content?.[0]?.text || "Şu an cevap veremedim.";
  const products = [];

  if (rawReply.includes("[PRODUCT: esim]")) products.push(PRODUCTS.esim);
  if (rawReply.includes("[PRODUCT: kitap]")) products.push(PRODUCTS.book);
  if (rawReply.includes("[PRODUCT: signedBook]")) products.push(PRODUCTS.signedBook);
  if (rawReply.includes("[PRODUCT: kurs]")) products.push(PRODUCTS.course);

  const cleanReply = rawReply
    .replace(/\[PRODUCT:\s*esim\]/gi, "")
    .replace(/\[PRODUCT:\s*kitap\]/gi, "")
    .replace(/\[PRODUCT:\s*kurs\]/gi, "")
    .replace(/\[PRODUCT:\s*signedBook\]/gi, "")
    .trim();

  return {
    reply: cleanReply,
    products
  };
}

function getChatHealth() {
  return {
    status: "ok",
    cachedPages: Object.keys(pageCache).length,
    lastRefreshAt
  };
}

async function startChatCache() {
  if (refreshStarted) return;
  refreshStarted = true;

  await refreshPages();
  setInterval(refreshPages, 1000 * 60 * 60 * 6);
}

module.exports = {
  handleChat,
  getChatHealth,
  startChatCache
};
