require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { runAllBriefings, loadClients, saveClients, sendAdminTest } = require("./briefing");

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.OUTSCRAPER_API_KEY;
const SECRET = process.env.BRIEFING_SECRET || "turfwatch2026";

// ─── Middleware ───
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5500"];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(ao => origin.startsWith(ao))) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiter
const rl = { reqs: [], check() { const n = Date.now(); this.reqs = this.reqs.filter(t => n - t < 60000); if (this.reqs.length >= 30) return false; this.reqs.push(n); return true; } };
function rateLimit(req, res, next) { if (!rl.check()) return res.status(429).json({ error: "Rate limit" }); next(); }

// ─── API Endpoints (for dashboard) ───

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasApiKey: !!API_KEY, hasAnthropic: !!process.env.ANTHROPIC_API_KEY, hasTwilio: !!process.env.TWILIO_ACCOUNT_SID, clients: loadClients().length, timestamp: new Date().toISOString() });
});

app.post("/api/validate", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });
  try {
    const r = await fetch(`https://api.app.outscraper.com/maps/search-v3?query=test&coordinates=43.6832,-79.2648&radius=500&limit=1&async=false`, { headers: { "X-API-KEY": key } });
    if (!r.ok) return res.status(r.status).json({ error: `Outscraper error: ${r.status}` });
    res.json({ valid: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/search", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });
  const { query, lat, lng, radius = 1500 } = req.body;
  try {
    const r = await fetch(`https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query || "business")}&coordinates=${lat},${lng}&radius=${radius}&limit=15&async=false`, { headers: { "X-API-KEY": key } });
    if (!r.ok) return res.status(r.status).json({ error: `Outscraper: ${r.status}` });
    const data = await r.json();
    const raw = data.data || [];
    const flat = Array.isArray(raw[0]) ? raw[0] : raw;
    res.json({ businesses: flat.map(b => ({ name: b.name || "", address: b.full_address || b.address || "", lat: b.latitude || 0, lng: b.longitude || 0, rating: b.rating || 0, reviewCount: b.reviews_count || 0, placeId: b.place_id || "", type: b.type || "", subtypes: Array.isArray(b.subtypes) ? b.subtypes : [], description: b.description || "" })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reviews", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });
  const { query, limit = 10 } = req.body;
  if (!query) return res.status(400).json({ error: "No query" });
  try {
    const r = await fetch(`https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(query)}&reviewsLimit=${limit}&async=false`, { headers: { "X-API-KEY": key } });
    if (!r.ok) return res.status(r.status).json({ error: `Outscraper: ${r.status}` });
    const data = await r.json();
    const raw = data.data || [];
    const flat = Array.isArray(raw[0]) ? raw[0] : raw;
    const biz = flat[0] || {};
    const reviews = (biz.reviews_data || []).map(rv => ({ author: rv.author_title || rv.author_name || "Anon", rating: rv.review_rating || rv.rating || 0, date: rv.review_datetime_utc || "", text: rv.review_text || rv.text || "" })).filter(rv => rv.text);
    res.json({ business: { name: biz.name || "", rating: biz.rating || 0, totalReviews: biz.reviews_count || 0 }, reviews });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/geocode", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "No address" });
  try {
    const r = await fetch(`https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(address)}&limit=1&async=false`, { headers: { "X-API-KEY": key } });
    if (!r.ok) throw new Error(`${r.status}`);
    const data = await r.json();
    const raw = data.data || [];
    const flat = Array.isArray(raw[0]) ? raw[0] : raw;
    if (flat.length > 0) { const p = flat[0]; res.json({ lat: p.latitude, lng: p.longitude, formattedAddress: p.full_address || address, name: p.name || "", placeId: p.place_id || "" }); }
    else res.status(404).json({ error: "Not found" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/classify", rateLimit, async (req, res) => {
  const { businesses } = req.body;
  if (!businesses) return res.status(400).json({ error: "No businesses" });
  const comp = ["barber", "barbershop", "hair", "salon", "grooming", "fade", "cut", "shave", "stylist", "restaurant", "cafe", "coffee", "gym", "fitness", "dental", "mechanic"];
  const nonComp = ["nail", "spa", "wax", "lash", "brow", "tattoo", "piercing", "pet", "dog", "cat", "pharmacy", "bank"];
  const results = businesses.map(b => {
    const subs = Array.isArray(b.subtypes) ? b.subtypes.join(" ") : (b.subtypes || "");
    const text = ((b.name || "") + " " + (b.type || "") + " " + subs + " " + (b.description || "")).toLowerCase();
    const isNon = nonComp.some(t => text.includes(t));
    const isCom = comp.some(t => text.includes(t));
    if (isNon && !isCom) return { name: b.name, isCompetitor: false, reason: "Different category", threat: "low" };
    if (isCom) return { name: b.name, isCompetitor: true, reason: "Overlapping services", threat: "medium" };
    return { name: b.name, isCompetitor: true, reason: "Potential competitor", threat: "medium" };
  });
  res.json({ classifications: results });
});

app.post("/api/analyze", rateLimit, async (req, res) => {
  const { reviews, businessName, isOwn, clientName, clientAddress } = req.body;
  const AK = process.env.ANTHROPIC_API_KEY;
  if (!AK) return res.status(400).json({ error: "No Anthropic key" });
  if (!reviews) return res.status(400).json({ error: "No reviews" });
  const shop = `${clientName || "business"} at ${clientAddress || "unknown"}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": AK, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: isOwn ? `Analyze reviews for ${shop} (owner's shop). JSON only: {"overallSentiment":"...","avgRating":0,"themes":[{"theme":"...","count":0,"sentiment":"..."}],"competitorMentions":[],"actionItems":[],"summary":"..."}` : `Analyze reviews for "${businessName}", competitor to ${shop}. JSON only: {"overallSentiment":"...","avgRating":0,"strengths":[],"weaknesses":[],"pricingSentiment":"","switchingSignals":[],"exploitableGaps":[],"summary":"..."}`, messages: [{ role: "user", content: JSON.stringify(reviews.slice(0, 15)) }] })
    });
    const data = await r.json();
    const raw = (data.content || []).map(i => i.text || "").join("") || "{}";
    res.json({ analysis: JSON.parse(raw.replace(/```json|```/g, "").trim()) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/report", rateLimit, async (req, res) => {
  const { text, competitorCount, threatScore, clientName, clientAddress } = req.body;
  const AK = process.env.ANTHROPIC_API_KEY;
  if (!AK) return res.status(400).json({ error: "No Anthropic key" });
  if (!text) return res.status(400).json({ error: "No text" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": AK, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: `TurfWatch AI for ${clientName || "business"} at ${clientAddress || "unknown"}. ${competitorCount || 0} competitors, threat ${threatScore || 50}/100. JSON only: {"cat":"...","threat":"high|medium|low|opportunity","insights":["..."],"rec":"...","impact":0}`, messages: [{ role: "user", content: text }] })
    });
    const data = await r.json();
    const raw = (data.content || []).map(i => i.text || "").join("") || "{}";
    res.json({ analysis: JSON.parse(raw.replace(/```json|```/g, "").trim()) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════
// ADMIN PAGE
// ═══════════════════════════════════════════════════

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0f;color:#e0e0ea;font-family:'Segoe UI',system-ui,sans-serif;padding:20px}
  .c{max-width:640px;margin:0 auto}
  h1{color:#e2bc48;font-size:22px;margin-bottom:4px} h2{color:#bbb;font-size:15px;margin:24px 0 10px;border-bottom:1px solid #1f1f2e;padding-bottom:6px}
  .card{background:#12141f;border:1px solid #1f1f2e;border-radius:10px;padding:16px;margin:8px 0}
  .row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  input,select,textarea{width:100%;padding:10px 12px;background:#1a1a2e;border:1px solid #2a2d44;border-radius:6px;color:#e0e0ea;font-size:13px;margin:3px 0 10px}
  textarea{resize:vertical;min-height:60px}
  label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1.2px;font-weight:600}
  button,.btn{padding:10px 18px;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;text-decoration:none;display:inline-block;text-align:center}
  .bg{background:#c9a035;color:#0a0a0f} .br{background:#d94040;color:#fff} .bn{background:#2fa85c;color:#fff} .bb{background:#4a78d4;color:#fff}
  .sm{padding:6px 12px;font-size:11px}
  .ok{color:#2fa85c} .err{color:#d94040} .mut{color:#6e7088;font-size:11px}
  pre{white-space:pre-wrap;background:#0d0f16;padding:12px;border-radius:6px;font-size:13px;line-height:1.6;margin:8px 0}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;margin:2px}
  .tag-green{background:#2fa85c22;color:#2fa85c} .tag-gold{background:#c9a03522;color:#c9a035}
  hr{border:none;border-top:1px solid #1f1f2e;margin:16px 0}
`;

const CATEGORIES = [
  ["barbershop", "Barbershop"], ["hair_salon", "Hair Salon"], ["grooming", "Grooming / Spa"],
  ["beauty_salon", "Beauty Salon"], ["nail_salon", "Nail Salon"], ["restaurant", "Restaurant"],
  ["cafe", "Cafe / Coffee Shop"], ["gym", "Gym / Fitness"], ["dentist", "Dentist"],
  ["auto_repair", "Auto Repair"], ["other", "Other"],
];

const RADII = [[500, "0.5 km"], [1000, "1.0 km"], [1500, "1.5 km"], [2000, "2.0 km"], [3000, "3.0 km"]];

function auth(req, res) {
  if (req.params.secret !== SECRET) { res.status(403).send("<h2>Access denied</h2>"); return false; }
  return true;
}

// ─── Admin: Main page ───
app.get("/admin/:secret", (req, res) => {
  if (!auth(req, res)) return;
  const clients = loadClients();
  const adminPhone = process.env.ADMIN_PHONE || "Not configured";

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TurfWatch Admin</title><style>${CSS}</style></head><body><div class="c">`;
  html += `<h1>TurfWatch Admin</h1><p class="mut">Manage businesses, send briefings, test SMS</p>`;
  
  // System status
  html += `<h2>System Status</h2><div class="card"><div class="grid2">`;
  html += `<div><label>Admin Phone</label><div>${adminPhone}</div></div>`;
  html += `<div><label>Clients</label><div>${clients.length} configured</div></div>`;
  html += `<div><label>Outscraper</label><div class="${API_KEY ? "ok" : "err"}">${API_KEY ? "Connected" : "Missing"}</div></div>`;
  html += `<div><label>Anthropic</label><div class="${process.env.ANTHROPIC_API_KEY ? "ok" : "err"}">${process.env.ANTHROPIC_API_KEY ? "Connected" : "Missing"}</div></div>`;
  html += `<div><label>Twilio</label><div class="${process.env.TWILIO_ACCOUNT_SID ? "ok" : "err"}">${process.env.TWILIO_ACCOUNT_SID ? "Connected" : "Missing"}</div></div>`;
  html += `<div><label>Schedule</label><div>Sun 8PM ET</div></div>`;
  html += `</div><hr>`;
  html += `<a href="/admin/${SECRET}/test-sms" class="btn bb sm">Send Test SMS to Admin</a>`;
  html += `</div>`;

  // Current clients
  html += `<h2>Businesses (${clients.length})</h2>`;
  if (clients.length === 0) html += `<p class="mut">No businesses configured yet. Add one below.</p>`;
  
  clients.forEach((c, i) => {
    html += `<div class="card"><div class="row"><div style="flex:1">`;
    html += `<strong style="font-size:14px">${c.name}</strong>`;
    html += ` <span class="tag tag-gold">${(c.category || "other").replace(/_/g, " ")}</span>`;
    html += `<br><span class="mut">${c.address}</span>`;
    html += `<br><span class="mut">Radius: ${((c.radius || 1500) / 1000).toFixed(1)} km · Coords: ${c.lat?.toFixed(4)}, ${c.lng?.toFixed(4)}</span>`;
    if (c.ownerName || c.ownerPhone) {
      html += `<br><span class="mut">Owner: ${c.ownerName || "—"} · ${c.ownerPhone || "No phone"}</span>`;
    }
    const smsLabel = c.smsEnabled === "on" ? (c.smsStartDate ? `On (starts ${c.smsStartDate})` : "On") : "Off";
    const smsColor = c.smsEnabled === "on" ? "tag-green" : "";
    html += `<br><span class="mut">SMS: </span><span class="tag ${smsColor}">${smsLabel}</span>`;
    html += `</div><div style="display:flex;flex-direction:column;gap:4px">`;
    html += `<a href="/admin/${SECRET}/persona/${i}" class="btn bg sm">Generate Persona</a>`;
    html += `<form method="POST" action="/admin/${SECRET}/delete/${i}" style="margin:0"><button type="submit" class="btn br sm">Delete</button></form>`;
    html += `</div></div></div>`;
  });

  // Add new client form
  html += `<h2>Add New Business</h2><div class="card"><form method="POST" action="/admin/${SECRET}/add">`;
  
  html += `<label>Business Name *</label><input name="name" placeholder="e.g. Cut N Run Barbershop" required>`;
  html += `<label>Business Address *</label><input name="address" placeholder="e.g. 1006 Kingston Rd, Toronto" required>`;
  
  html += `<div class="grid2">`;
  html += `<div><label>Category *</label><select name="category">`;
  CATEGORIES.forEach(([v, l]) => { html += `<option value="${v}">${l}</option>`; });
  html += `</select></div>`;
  html += `<div><label>Scan Radius</label><select name="radius">`;
  RADII.forEach(([v, l]) => { html += `<option value="${v}" ${v === 1500 ? "selected" : ""}>${l}</option>`; });
  html += `</select></div></div>`;

  html += `<hr><label style="font-size:12px;color:#e2bc48">Business Owner Details</label>`;
  html += `<div class="grid2">`;
  html += `<div><label>Owner Name</label><input name="ownerName" placeholder="e.g. Marcus"></div>`;
  html += `<div><label>Owner Phone</label><input name="ownerPhone" placeholder="e.g. +16471234567"></div>`;
  html += `</div>`;

  html += `<hr><label style="font-size:12px;color:#e2bc48">Weekly SMS Briefing</label>`;
  html += `<div class="grid2">`;
  html += `<div><label>SMS Status</label><select name="smsEnabled"><option value="off" selected>Off — not sending yet</option><option value="on">On — send weekly briefings</option></select></div>`;
  html += `<div><label>Start Date (optional)</label><input type="date" name="smsStartDate" style="color-scheme:dark"></div>`;
  html += `</div>`;
  html += `<p class="mut">When SMS is "Off", briefings are generated but not sent. Turn it on when you're ready to start sending to the owner.</p>`;

  html += `<br><button type="submit" class="btn bg">Add Business</button>`;
  html += `</form></div>`;

  // Actions
  html += `<h2>Actions</h2><div class="card">`;
  html += `<p class="mut" style="margin-bottom:10px">Briefing pipeline: scan competitors → fetch reviews → AI analysis → SMS (if enabled)</p>`;
  html += `<a href="/admin/${SECRET}/send" class="btn bn">Send Briefing Now</a> `;
  html += `<a href="/admin/${SECRET}/preview" class="btn bg" style="margin-left:6px">Preview Only</a>`;
  html += `<hr>`;
  html += `<p class="mut" style="margin-bottom:10px">Full competitive intelligence report — printable / save as PDF</p>`;
  clients.forEach((c, i) => {
    html += `<a href="/admin/${SECRET}/report/${i}" class="btn bb sm" style="margin:3px">${c.name} Report</a> `;
  });
  if (clients.length === 0) html += `<span class="mut">Add a business first to generate reports.</span>`;
  html += `</div>`;

  html += `</div></body></html>`;
  res.send(html);
});

// ─── Admin: Add client (auto-geocodes address) ───
app.post("/admin/:secret/add", async (req, res) => {
  if (!auth(req, res)) return;
  try {
    const { name, address, category, radius, ownerName, ownerPhone, smsEnabled, smsStartDate } = req.body;
    if (!name || !address) return res.status(400).send(`Business name and address are required. <br><br><a href="/admin/${SECRET}">Go back</a>`);
    
    // Auto-geocode the address using Outscraper
    let lat = 0, lng = 0, formattedAddress = address;
    console.log(`[ADMIN] Adding client: "${name}" at "${address}"`);
    
    if (!API_KEY) {
      return res.status(500).send(`Outscraper API key not configured. Add OUTSCRAPER_API_KEY to Railway variables. <br><br><a href="/admin/${SECRET}">Go back</a>`);
    }

    try {
      const searchQuery = `${name.trim()} ${address.trim()}`;
      console.log(`[ADMIN] Geocoding: "${searchQuery}"`);
      const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(searchQuery)}&limit=1&async=false`;
      const r = await fetch(url, { headers: { "X-API-KEY": API_KEY } });
      console.log(`[ADMIN] Geocode response: ${r.status}`);
      if (r.ok) {
        const data = await r.json();
        const raw = data.data || [];
        const flat = Array.isArray(raw[0]) ? raw[0] : raw;
        if (flat.length > 0) {
          lat = flat[0].latitude || 0;
          lng = flat[0].longitude || 0;
          formattedAddress = flat[0].full_address || flat[0].address || address;
          console.log(`[ADMIN] Found: ${lat}, ${lng} — ${formattedAddress}`);
        }
      }
    } catch (geoErr) {
      console.error(`[ADMIN] Geocoding error:`, geoErr.message);
    }

    // Fallback: try just the address
    if (lat === 0 && lng === 0) {
      try {
        console.log(`[ADMIN] Trying address-only geocode: "${address}"`);
        const url2 = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(address.trim())}&limit=1&async=false`;
        const r2 = await fetch(url2, { headers: { "X-API-KEY": API_KEY } });
        if (r2.ok) {
          const data2 = await r2.json();
          const raw2 = data2.data || [];
          const flat2 = Array.isArray(raw2[0]) ? raw2[0] : raw2;
          if (flat2.length > 0) {
            lat = flat2[0].latitude || 0;
            lng = flat2[0].longitude || 0;
            formattedAddress = flat2[0].full_address || flat2[0].address || address;
            console.log(`[ADMIN] Fallback found: ${lat}, ${lng}`);
          }
        }
      } catch (e2) {
        console.error(`[ADMIN] Fallback geocode error:`, e2.message);
      }
    }

    if (lat === 0 && lng === 0) {
      return res.status(400).send(`Could not find coordinates for "${name}" at "${address}". Please check the address and try again. <br><br><a href="/admin/${SECRET}">Go back</a>`);
    }

    const clients = loadClients();
    clients.push({
      name: name.trim(),
      address: formattedAddress,
      category: category || "other",
      radius: parseInt(radius) || 1500,
      lat,
      lng,
      ownerName: (ownerName || "").trim(),
      ownerPhone: (ownerPhone || "").trim(),
      smsEnabled: smsEnabled || "off",
      smsStartDate: smsStartDate || "",
      addedAt: new Date().toISOString(),
    });
    saveClients(clients);
    console.log(`[ADMIN] Client added: ${name.trim()} (${lat}, ${lng})`);
    res.redirect(`/admin/${SECRET}`);
  } catch (e) {
    console.error(`[ADMIN] Add client error:`, e.message);
    res.status(500).send(`Error adding client: ${e.message} <br><br><a href="/admin/${SECRET}">Go back</a>`);
  }
});

// ─── Admin: Delete client ───
app.post("/admin/:secret/delete/:index", (req, res) => {
  if (!auth(req, res)) return;
  const clients = loadClients();
  const idx = parseInt(req.params.index);
  if (idx >= 0 && idx < clients.length) { clients.splice(idx, 1); saveClients(clients); }
  res.redirect(`/admin/${SECRET}`);
});

// ─── Admin: Generate Persona ───
app.get("/admin/:secret/persona/:index", async (req, res) => {
  if (!auth(req, res)) return;
  const clients = loadClients();
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= clients.length) return res.status(404).send("Client not found");
  const client = clients[idx];
  const AK = process.env.ANTHROPIC_API_KEY;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style></head><body><div class="c">`;
  html += `<h1>Client Persona</h1><p class="mut">${client.name} · ${client.address}</p><hr>`;
  html += `<p class="mut">Pulling reviews and generating persona... this takes 30-60 seconds.</p>`;

  try {
    // Step 1: Fetch own reviews
    const ownQuery = `${client.name} ${client.address}`;
    const ownUrl = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(ownQuery)}&reviewsLimit=30&async=false`;
    const ownRes = await fetch(ownUrl, { headers: { "X-API-KEY": API_KEY } });
    if (!ownRes.ok) throw new Error(`Failed to fetch reviews: ${ownRes.status}`);
    const ownData = await ownRes.json();
    const ownRaw = ownData.data || [];
    const ownFlat = Array.isArray(ownRaw[0]) ? ownRaw[0] : ownRaw;
    const ownBiz = ownFlat[0] || {};
    const ownReviews = (ownBiz.reviews_data || []).map(r => ({
      author: r.author_title || r.author_name || "Anon",
      rating: r.review_rating || r.rating || 0,
      text: r.review_text || r.text || "",
      date: r.review_datetime_utc || "",
    })).filter(r => r.text);

    html += `<div class="card"><p class="mut">Found ${ownReviews.length} reviews for ${client.name} (rated ${ownBiz.rating || "?"}★)</p></div>`;

    // Step 2: Fetch top competitor reviews
    const catLabel = (client.category || "business").replace(/_/g, " ");
    const searchQueries = {
      barbershop: "barbershop OR barber OR men's grooming",
      hair_salon: "hair salon OR hairdresser",
      grooming: "grooming OR spa",
      restaurant: "restaurant OR dining",
      cafe: "cafe OR coffee shop",
      gym: "gym OR fitness",
      dentist: "dentist OR dental",
      other: "business",
    };
    const searchQ = searchQueries[client.category] || searchQueries.other;
    const compUrl = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(searchQ)}&coordinates=${client.lat},${client.lng}&radius=${client.radius || 1500}&limit=10&async=false`;
    const compRes = await fetch(compUrl, { headers: { "X-API-KEY": API_KEY } });
    let competitors = [];
    if (compRes.ok) {
      const compData = await compRes.json();
      const compRaw = compData.data || [];
      competitors = (Array.isArray(compRaw[0]) ? compRaw[0] : compRaw)
        .filter(c => c.name && c.name.toLowerCase() !== client.name.toLowerCase())
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 5);
    }

    // Fetch reviews for top 5 competitors
    let compReviewText = "";
    for (const comp of competitors.slice(0, 5)) {
      try {
        const cq = comp.place_id || comp.name + " " + (comp.full_address || "Toronto");
        const crUrl = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(cq)}&reviewsLimit=15&async=false`;
        const crRes = await fetch(crUrl, { headers: { "X-API-KEY": API_KEY } });
        if (crRes.ok) {
          const crData = await crRes.json();
          const crRaw = crData.data || [];
          const crFlat = Array.isArray(crRaw[0]) ? crRaw[0] : crRaw;
          const crBiz = crFlat[0] || {};
          const crRevs = (crBiz.reviews_data || []).map(r => r.review_text || r.text || "").filter(Boolean).slice(0, 8);
          compReviewText += `\n\n${comp.name} (${comp.rating}★, ${crBiz.reviews_count || 0} total reviews):\n${crRevs.map((t, j) => (j+1) + '. "' + t.substring(0, 150) + '"').join("\n")}`;
        }
      } catch (e) { /* skip */ }
    }

    // Step 3: Generate persona with Claude
    if (!AK) throw new Error("Anthropic API key not configured");

    const personaPrompt = `You are a business intelligence analyst. Analyze these Google reviews to build a detailed CLIENT PERSONA for ${client.name}, a ${catLabel} at ${client.address}.

YOUR BUSINESS REVIEWS (${ownReviews.length} reviews, ${ownBiz.rating || "?"}★ average):
${ownReviews.slice(0, 25).map(r => `[${r.rating}★] ${r.text}`).join("\n")}

COMPETITOR LANDSCAPE:
${competitors.map(c => `- ${c.name}: ${c.rating}★ (${c.reviews_count || 0} reviews) — ${Array.isArray(c.subtypes) ? c.subtypes.join(", ") : (c.subtypes || c.type || "")}`).join("\n")}

COMPETITOR REVIEWS:${compReviewText || "\nNo competitor reviews available."}

Based on ALL this data, create a comprehensive client persona. Be specific — use actual quotes, actual patterns, actual numbers from the reviews. No generic marketing speak.

Format your response EXACTLY like this:

WHO COMES HERE
(Demographics, lifestyle indicators, patterns you see in the reviews — be specific about age ranges, types of people, family status if mentioned)

WHY THEY CHOOSE YOU
(The top 3-4 reasons people come here based on what they actually say. Name specific staff if mentioned. Quote key phrases.)

WHAT THEY WISH WAS DIFFERENT  
(Service gaps, complaints, requests — with frequency. e.g. "beard services (mentioned 4x)")

YOUR COMPETITIVE POSITION
(How clients see you vs competitors. Who are you losing clients to and why? Who are you winning clients from?)

FLIGHT RISK
(Which client segments are most likely to leave? What would trigger it?)

LOYALTY ANCHORS
(What keeps people coming back? What's hardest for competitors to replicate?)

ONE-SENTENCE PERSONA
(Summarize your typical client in one vivid sentence)

STRATEGIC IMPLICATION
(One paragraph: what does this persona tell the owner about where to invest and what to protect?)`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": AK, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: personaPrompt }] }),
    });
    const aiData = await aiRes.json();
    const personaText = (aiData.content || []).map(i => i.text || "").join("") || "Persona generation failed.";

    // Render the persona
    html += `<div class="card">`;
    html += `<h2 style="color:#e2bc48;margin:0 0 4px">📋 ${client.name} — Client Persona</h2>`;
    html += `<p class="mut">${ownReviews.length} reviews analyzed · ${competitors.length} competitors scanned · ${ownBiz.rating || "?"}★ rating</p>`;
    html += `<hr>`;
    
    // Format the persona text with section headers highlighted
    const formatted = personaText
      .replace(/^(WHO COMES HERE|WHY THEY CHOOSE YOU|WHAT THEY WISH WAS DIFFERENT|YOUR COMPETITIVE POSITION|FLIGHT RISK|LOYALTY ANCHORS|ONE-SENTENCE PERSONA|STRATEGIC IMPLICATION)/gm, 
        '<h3 style="color:#e2bc48;margin:16px 0 6px;font-size:13px">$1</h3>')
      .replace(/\n/g, "<br>");
    
    html += `<div style="font-size:13px;line-height:1.7;color:#ccc">${formatted}</div>`;
    html += `</div>`;

    // Summary stats
    html += `<div class="card"><h3 style="color:#bbb;margin:0 0 8px">Data Sources</h3>`;
    html += `<div class="grid2">`;
    html += `<div><label>Your Reviews</label><div>${ownReviews.length} analyzed</div></div>`;
    html += `<div><label>Your Rating</label><div>${ownBiz.rating || "?"}★</div></div>`;
    html += `<div><label>Competitors Found</label><div>${competitors.length}</div></div>`;
    html += `<div><label>Generated</label><div>${new Date().toLocaleString()}</div></div>`;
    html += `</div></div>`;

  } catch (e) {
    html += `<div class="card"><h3 class="err">Persona generation failed</h3><p class="err">${e.message}</p></div>`;
  }

  html += `<br><a href="/admin/${SECRET}" class="btn bg">Back to Admin</a>`;
  html += `</div></body></html>`;
  res.send(html);
});

// ─── Admin: Full Competitive Intelligence Report (printable PDF) ───
app.get("/admin/:secret/report/:index", async (req, res) => {
  if (!auth(req, res)) return;
  const clients = loadClients();
  const idx = parseInt(req.params.index);
  if (idx < 0 || idx >= clients.length) return res.status(404).send("Client not found");
  const client = clients[idx];
  const AK = process.env.ANTHROPIC_API_KEY;
  const catLabel = (client.category || "business").replace(/_/g, " ");
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Print-friendly CSS
  const PRINT_CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;padding:40px;max-width:800px;margin:0 auto;font-size:14px;line-height:1.7}
    h1{font-size:28px;color:#1a1a1a;margin-bottom:4px;font-weight:900;letter-spacing:-0.5px}
    h2{font-size:18px;color:#333;margin:28px 0 12px;padding-bottom:6px;border-bottom:2px solid #c9a035}
    h3{font-size:14px;color:#555;margin:16px 0 6px;text-transform:uppercase;letter-spacing:1px}
    p{margin:6px 0} .lead{font-size:16px;color:#444;line-height:1.8}
    .header{border-bottom:3px solid #1a1a1a;padding-bottom:16px;margin-bottom:24px}
    .subtitle{color:#666;font-size:14px} .date{color:#999;font-size:12px}
    .brand{color:#c9a035;font-size:12px;text-transform:uppercase;letter-spacing:3px;font-family:sans-serif;font-weight:700}
    .stat-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}
    .stat{background:#f8f6f0;padding:14px;border-radius:6px;text-align:center}
    .stat-num{font-size:28px;font-weight:900;color:#1a1a1a} .stat-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px}
    .comp-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee}
    .comp-name{font-weight:700} .comp-meta{color:#888;font-size:12px}
    .threat-high{color:#d94040;font-weight:700} .threat-med{color:#d08530} .threat-low{color:#2fa85c}
    .review-box{background:#f8f6f0;padding:12px 16px;border-radius:6px;margin:8px 0;border-left:3px solid #c9a035}
    .review-author{font-weight:700;font-size:12px} .review-stars{color:#e2bc48}
    .action-box{background:#fffbe6;border:2px solid #c9a035;padding:16px;border-radius:8px;margin:16px 0}
    .action-title{color:#c9a035;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:700;font-family:sans-serif}
    .insight{padding:8px 0;border-bottom:1px solid #f0f0f0}
    .footer{margin-top:40px;padding-top:16px;border-top:2px solid #1a1a1a;color:#999;font-size:11px;text-align:center}
    .no-print{background:#c9a035;color:#0a0a0f;padding:12px 24px;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;display:block;margin:0 auto 30px;font-family:sans-serif}
    @media print{.no-print{display:none !important} body{padding:20px}}
  `;

  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${client.name} — Competitive Intelligence Report</title><style>${PRINT_CSS}</style></head><body>`;
  html += `<button class="no-print" onclick="window.print()">Save as PDF / Print</button>`;

  try {
    // ─── Fetch all data ───
    // Own reviews
    const ownQuery = `${client.name} ${client.address}`;
    const ownUrl = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(ownQuery)}&reviewsLimit=30&async=false`;
    const ownRes = await fetch(ownUrl, { headers: { "X-API-KEY": API_KEY } });
    if (!ownRes.ok) throw new Error(`Reviews fetch failed: ${ownRes.status}`);
    const ownData = await ownRes.json();
    const ownRaw = ownData.data || [];
    const ownFlat = Array.isArray(ownRaw[0]) ? ownRaw[0] : ownRaw;
    const ownBiz = ownFlat[0] || {};
    const ownReviews = (ownBiz.reviews_data || []).map(r => ({
      author: r.author_title || r.author_name || "Anonymous",
      rating: r.review_rating || r.rating || 0,
      text: r.review_text || r.text || "",
      date: r.review_datetime_utc || "",
    })).filter(r => r.text);

    // Competitors
    const searchQueries = { barbershop:"barbershop OR barber OR grooming", hair_salon:"hair salon OR hairdresser", grooming:"grooming OR spa", restaurant:"restaurant OR dining", cafe:"cafe OR coffee shop", gym:"gym OR fitness", dentist:"dentist OR dental", other:"business" };
    const searchQ = searchQueries[client.category] || searchQueries.other;
    const compUrl = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(searchQ)}&coordinates=${client.lat},${client.lng}&radius=${client.radius || 1500}&limit=15&async=false`;
    const compRes = await fetch(compUrl, { headers: { "X-API-KEY": API_KEY } });
    let competitors = [];
    if (compRes.ok) {
      const compData = await compRes.json();
      const compRaw = compData.data || [];
      competitors = (Array.isArray(compRaw[0]) ? compRaw[0] : compRaw)
        .filter(c => c.name && c.name.toLowerCase() !== client.name.toLowerCase())
        .sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    // Fetch reviews for top 5 competitors
    const topComps = competitors.slice(0, 5);
    for (const comp of topComps) {
      try {
        const cq = comp.place_id || comp.name + " " + (comp.full_address || "Toronto");
        const crUrl = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(cq)}&reviewsLimit=15&async=false`;
        const crRes = await fetch(crUrl, { headers: { "X-API-KEY": API_KEY } });
        if (crRes.ok) {
          const crData = await crRes.json();
          const crRaw = crData.data || [];
          const crFlat = Array.isArray(crRaw[0]) ? crRaw[0] : crRaw;
          const crBiz = crFlat[0] || {};
          comp.fetchedReviews = (crBiz.reviews_data || []).map(r => ({
            author: r.author_title || r.author_name || "Anon",
            rating: r.review_rating || r.rating || 0,
            text: r.review_text || r.text || "",
          })).filter(r => r.text);
        }
      } catch (e) { comp.fetchedReviews = []; }
    }

    // ─── AI Analysis ───
    const aiPrompt = `You are a competitive intelligence analyst preparing a comprehensive report for ${client.name}, a ${catLabel} at ${client.address}.

DATA:
Own business: ${ownBiz.rating || "?"}★, ${ownBiz.reviews_count || 0} reviews
Own reviews: ${JSON.stringify(ownReviews.slice(0, 20))}

Competitors (${competitors.length} found within ${((client.radius || 1500) / 1000).toFixed(1)} km):
${topComps.map(c => `${c.name}: ${c.rating}★ (${c.reviews_count || 0} reviews) — ${Array.isArray(c.subtypes) ? c.subtypes.join(", ") : (c.subtypes || c.type || "")}\nReviews: ${(c.fetchedReviews || []).slice(0, 5).map(r => '[' + r.rating + '★] ' + r.text.substring(0, 120)).join(" | ")}`).join("\n\n")}

Generate a comprehensive competitive intelligence report with these sections. Be specific — use real data, real names, real quotes. No generic advice.

1. EXECUTIVE SUMMARY (3-4 sentences: where does this business stand competitively?)
2. YOUR STRENGTHS (what reviews consistently praise — with quotes)
3. YOUR VULNERABILITIES (what reviews criticize or wish for — with quotes and frequency)
4. COMPETITOR ANALYSIS (for each of the top 5 competitors: their position, strengths, weaknesses, and what you can learn or exploit)
5. CLIENT PERSONA (who comes here, why, what they value most)
6. THREAT ASSESSMENT (what's the biggest risk in the next 6 months?)
7. OPPORTUNITIES (3 specific things the owner should do, ranked by impact)
8. RECOMMENDED ACTIONS (for this week, this month, this quarter — concrete and specific)

Respond with the report text. Use clear section headers.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": AK, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, messages: [{ role: "user", content: aiPrompt }] }),
    });
    const aiData = await aiRes.json();
    const reportText = (aiData.content || []).map(i => i.text || "").join("") || "Report generation failed.";

    // ─── Render the report ───
    html += `<div class="header">`;
    html += `<div class="brand">TurfWatch Competitive Intelligence</div>`;
    html += `<h1>${client.name}</h1>`;
    html += `<div class="subtitle">${client.address} · ${catLabel}</div>`;
    html += `<div class="date">Report generated ${dateStr}</div>`;
    html += `</div>`;

    // Key metrics
    html += `<div class="stat-grid">`;
    html += `<div class="stat"><div class="stat-num">${ownBiz.rating || "—"}</div><div class="stat-label">Your Rating</div></div>`;
    html += `<div class="stat"><div class="stat-num">${ownReviews.length}</div><div class="stat-label">Reviews Analyzed</div></div>`;
    html += `<div class="stat"><div class="stat-num">${competitors.length}</div><div class="stat-label">Competitors Found</div></div>`;
    html += `</div>`;

    // Competitor quick table
    html += `<h2>Competitive Landscape</h2>`;
    topComps.forEach(c => {
      const threat = (c.rating || 0) >= (ownBiz.rating || 0) ? "threat-high" : (c.rating || 0) >= (ownBiz.rating || 0) - 0.3 ? "threat-med" : "threat-low";
      html += `<div class="comp-row"><div><span class="comp-name">${c.name}</span><br><span class="comp-meta">${c.full_address || ""}</span></div>`;
      html += `<div style="text-align:right"><span class="review-stars">${"★".repeat(Math.round(c.rating || 0))}</span> ${c.rating || 0}<br><span class="comp-meta">${c.reviews_count || 0} reviews</span></div></div>`;
    });

    // AI report
    const formatted = reportText
      .replace(/^(EXECUTIVE SUMMARY|YOUR STRENGTHS|YOUR VULNERABILITIES|COMPETITOR ANALYSIS|CLIENT PERSONA|THREAT ASSESSMENT|OPPORTUNITIES|RECOMMENDED ACTIONS)/gm, '</p><h2>$1</h2><p>')
      .replace(/^(\d+\.\s+.+)/gm, '</p><h2>$1</h2><p>')
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");
    html += `<div class="lead">${formatted}</div>`;

    // Selected reviews
    html += `<h2>Key Reviews — Your Business</h2>`;
    ownReviews.slice(0, 6).forEach(r => {
      html += `<div class="review-box"><span class="review-author">${r.author}</span> <span class="review-stars">${"★".repeat(r.rating)}</span><br>${r.text.substring(0, 200)}${r.text.length > 200 ? "..." : ""}</div>`;
    });

    // Footer
    html += `<div class="footer">`;
    html += `<div class="brand">TurfWatch</div>`;
    html += `<p>Competitive Intelligence Report · ${dateStr}</p>`;
    html += `<p>Data sources: Google Reviews via Outscraper · AI analysis via Anthropic Claude</p>`;
    html += `<p>${client.name} · ${client.address} · ${((client.radius || 1500) / 1000).toFixed(1)} km scan radius</p>`;
    html += `</div>`;

  } catch (e) {
    html += `<h2 style="color:#d94040">Report generation failed</h2><p>${e.message}</p>`;
  }

  html += `<button class="no-print" onclick="window.print()" style="margin-top:30px">Save as PDF / Print</button>`;
  html += `</body></html>`;
  res.send(html);
});

// ─── Admin: Test SMS to admin ───
app.get("/admin/:secret/test-sms", async (req, res) => {
  if (!auth(req, res)) return;
  let html = `<!DOCTYPE html><html><head><style>${CSS}</style></head><body><div class="c">`;
  html += `<h1>SMS Test</h1>`;
  try {
    const result = await sendAdminTest();
    html += `<div class="card"><h3 class="ok">SMS sent successfully</h3>`;
    html += `<p class="mut">To: ${result.phone}</p>`;
    html += `<p class="mut">SID: ${result.sid}</p>`;
    html += `<pre>${result.message}</pre></div>`;
  } catch (e) {
    html += `<div class="card"><h3 class="err">SMS failed</h3><p class="err">${e.message}</p></div>`;
  }
  html += `<br><a href="/admin/${SECRET}" class="btn bg">Back to Admin</a>`;
  html += `</div></body></html>`;
  res.send(html);
});

// ─── Admin: Send briefings ───
app.get("/admin/:secret/send", async (req, res) => {
  if (!auth(req, res)) return;
  res.setHeader("Content-Type", "text/html");
  res.write(`<!DOCTYPE html><html><head><style>${CSS}</style></head><body><div class="c">`);
  res.write("<h1>Sending Briefings...</h1><p class='mut'>30-60 seconds per business.</p><hr>");
  try {
    const results = await runAllBriefings();
    results.forEach(r => {
      res.write(`<div class="card"><h3 class="${r.success ? 'ok' : 'err'}">${r.success ? 'OK' : 'FAIL'} — ${r.client}</h3>`);
      if (r.success) {
        res.write(`<p class="mut">Rating: ${r.ownRating || "?"} stars · ${r.ownReviewCount || 0} reviews · ${r.competitorsFound || 0} competitors found</p>`);
      }
      if (r.briefing) res.write(`<pre>${r.briefing}</pre>`);
      if (r.smsSent) r.smsSent.forEach(s => {
        res.write(`<p class="${s.sid ? 'ok' : 'err'} mut">SMS → ${s.to} (${s.phone}): ${s.sid || s.error || "not sent"}</p>`);
      });
      if (r.error) res.write(`<p class="err">${r.error}</p>`);
      res.write("</div>");
    });
  } catch (e) { res.write(`<p class="err">Error: ${e.message}</p>`); }
  res.write(`<br><a href="/admin/${SECRET}" class="btn bg">Back to Admin</a>`);
  res.end("</div></body></html>");
});

// ─── Admin: Preview (no SMS) ───
app.get("/admin/:secret/preview", async (req, res) => {
  if (!auth(req, res)) return;
  // Temp remove phones
  const clients = loadClients();
  const saved = clients.map(c => ({ op: c.ownerPhone }));
  clients.forEach(c => c.ownerPhone = "");
  saveClients(clients);
  const origAdmin = process.env.ADMIN_PHONE;
  process.env.ADMIN_PHONE = "";

  res.setHeader("Content-Type", "text/html");
  res.write(`<!DOCTYPE html><html><head><style>${CSS}</style></head><body><div class="c">`);
  res.write("<h1>Briefing Preview</h1><p class='mut'>No SMS sent.</p><hr>");
  try {
    const results = await runAllBriefings();
    results.forEach(r => {
      res.write(`<div class="card"><h3 class="${r.success ? 'ok' : 'err'}">${r.success ? 'OK' : 'FAIL'} — ${r.client}</h3>`);
      if (r.success) res.write(`<p class="mut">Rating: ${r.ownRating || "?"} stars · ${r.ownReviewCount || 0} reviews · ${r.competitorsFound || 0} competitors</p>`);
      if (r.briefing) res.write(`<pre>${r.briefing}</pre>`);
      if (r.error) res.write(`<p class="err">${r.error}</p>`);
      res.write("</div>");
    });
  } catch (e) { res.write(`<p class="err">Error: ${e.message}</p>`); }

  // Restore phones
  clients.forEach((c, i) => c.ownerPhone = saved[i].op);
  saveClients(clients);
  process.env.ADMIN_PHONE = origAdmin || "";
  res.write(`<br><a href="/admin/${SECRET}" class="btn bg">Back to Admin</a>`);
  res.end("</div></body></html>");
});

// ─── Cron ───
function startScheduler() {
  const H = parseInt(process.env.BRIEFING_HOUR || "20");
  const D = parseInt(process.env.BRIEFING_DAY || "0");
  const TZ = parseInt(process.env.TZ_OFFSET || "-4");
  console.log(`  Schedule: ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][D]} ${H}:00 (UTC${TZ >= 0 ? "+" : ""}${TZ})`);
  let last = null;
  setInterval(() => {
    const now = new Date();
    const lh = (now.getUTCHours() + TZ + 24) % 24;
    const today = now.toDateString();
    if (now.getUTCDay() === D && lh === H && last !== today) {
      last = today;
      console.log(`[CRON] Briefing triggered — ${now.toISOString()}`);
      runAllBriefings().catch(e => console.error("[CRON]", e.message));
    }
  }, 3600000);
}

// ─── Start ───
app.listen(PORT, () => {
  console.log(`
  TurfWatch v3
  Port: ${PORT}
  Admin: /admin/${SECRET}
  Outscraper: ${API_KEY ? "OK" : "MISSING"}
  Anthropic: ${process.env.ANTHROPIC_API_KEY ? "OK" : "MISSING"}
  Twilio: ${process.env.TWILIO_ACCOUNT_SID ? "OK" : "MISSING"}
  Admin Phone: ${process.env.ADMIN_PHONE || "NOT SET"}`);
  startScheduler();
});
