// ═══════════════════════════════════════════════════════════
// TurfWatch SMS Briefing Engine v3
// Fully dynamic — no hardcoded businesses
// ═══════════════════════════════════════════════════════════

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

// ─── Client Storage ───
const CLIENTS_FILE = path.join(__dirname, "clients.json");

function loadClients() {
  try {
    if (fs.existsSync(CLIENTS_FILE)) {
      return JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8"));
    }
  } catch (e) { console.error("Failed to read clients.json:", e.message); }
  return [];
}

function saveClients(clients) {
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
}

// ─── Configuration ───
function getConfig() {
  return {
    outscraper: process.env.OUTSCRAPER_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    twilio: {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_PHONE_NUMBER,
    },
    adminPhone: process.env.ADMIN_PHONE || "",
  };
}

// ─── Outscraper: Search nearby businesses ───
async function searchNearby(apiKey, query, lat, lng, radius) {
  const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&coordinates=${lat},${lng}&radius=${radius}&limit=15&async=false`;
  const res = await fetch(url, { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) throw new Error(`Outscraper search failed: ${res.status}`);
  const data = await res.json();
  const results = data.data || [];
  return Array.isArray(results[0]) ? results[0] : results;
}

// ─── Outscraper: Fetch reviews ───
async function fetchReviews(apiKey, query, limit = 10) {
  const url = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(query)}&reviewsLimit=${limit}&async=false`;
  const res = await fetch(url, { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) throw new Error(`Outscraper reviews failed: ${res.status}`);
  const data = await res.json();
  const results = data.data || [];
  const flat = Array.isArray(results[0]) ? results[0] : results;
  const biz = flat[0] || flat;
  const reviews = (biz.reviews_data || [])
    .map((r) => ({
      author: r.author_title || r.author_name || "Anonymous",
      rating: r.review_rating || r.rating || 0,
      date: r.review_datetime_utc || "",
      text: r.review_text || r.text || "",
    }))
    .filter((r) => r.text);

  return {
    name: biz.name || "",
    rating: biz.rating || 0,
    totalReviews: biz.reviews_count || 0,
    reviews,
  };
}

// ─── Build search query based on business category ───
function getSearchQuery(category) {
  const queries = {
    barbershop: "barbershop OR barber OR men's grooming",
    hair_salon: "hair salon OR hairdresser OR stylist",
    grooming: "grooming OR spa OR men's grooming",
    beauty_salon: "beauty salon OR aesthetics OR skincare",
    nail_salon: "nail salon OR manicure OR pedicure",
    restaurant: "restaurant OR dining OR eatery",
    cafe: "cafe OR coffee shop OR bakery",
    gym: "gym OR fitness OR crossfit OR personal training",
    dentist: "dentist OR dental clinic OR dental office",
    auto_repair: "auto repair OR mechanic OR car service",
    other: "business",
  };
  return queries[category] || queries.other;
}

// ─── Safe subtypes helper ───
function getSubtypes(c) {
  if (Array.isArray(c.subtypes)) return c.subtypes.join(", ");
  if (typeof c.subtypes === "string") return c.subtypes;
  return c.type || "business";
}

// ─── Claude: Generate the briefing ───
async function generateBriefing(anthropicKey, client, ownData, competitors) {
  const categoryLabel = (client.category || "business").replace(/_/g, " ");
  
  const prompt = `You are TurfWatch, a competitive intelligence system for ${client.name} at ${client.address}.
This is a ${categoryLabel}.

Here is this week's data:

YOUR BUSINESS:
- Rating: ${ownData.rating} stars (${ownData.totalReviews} total reviews)
- Recent reviews: ${JSON.stringify(ownData.reviews.slice(0, 5))}

NEARBY COMPETITORS (within ${((client.radius || 1500) / 1000).toFixed(1)} km):
${competitors.map((c) => `- ${c.name}: ${c.rating} stars (${c.reviews_count || c.totalReviews || 0} reviews) — ${getSubtypes(c)}`).join("\n")}

TOP COMPETITOR REVIEWS:
${competitors.slice(0, 3).map((c) => `${c.name}: ${(c.recentReviews || []).slice(0, 2).map((r) => '"' + (r.text || "").substring(0, 80) + '..." (' + r.rating + ' stars)').join("; ")}`).join("\n")}

Generate a weekly SMS briefing for the ${categoryLabel} owner. STRICT RULES:
- Maximum 450 characters total (SMS limit)
- Use these EXACT sections in this EXACT order:
  -> DO THIS (one specific action for Monday, under 30 minutes, concrete not vague)
  -> WHY (the data point or competitive shift that makes this urgent)
  -> YOU vs THEM (your rating vs most relevant competitor — one line)
  -> MOMENTUM: (Rising / Holding / Slipping — plus short reason)
- ACTION FIRST. Lead with what to do.
- Be specific — use actual competitor names, actual review quotes, actual numbers
- No fluff, no pleasantries — direct commands only

Respond ONLY with the SMS text, nothing else.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  const text = (data.content || []).map((i) => i.text || "").join("") || "Briefing generation failed.";
  return `TurfWatch — ${client.name}\n\n${text.trim()}`;
}

// ─── Twilio: Send SMS ───
async function sendSMS(twilioConfig, to, body) {
  const { sid, token, from } = twilioConfig;
  if (!sid || !token || !from || !to) {
    throw new Error("Missing Twilio config or recipient phone number");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Twilio error: ${res.status} — ${err.message || JSON.stringify(err)}`);
  }

  return (await res.json()).sid;
}

// ─── Run briefing for one client ───
async function runBriefing(client, config) {
  console.log(`\n[BRIEFING] Starting for ${client.name}...`);

  // Step 1: Search for nearby competitors based on category
  const searchQuery = getSearchQuery(client.category);
  console.log(`[BRIEFING] Scanning nearby: "${searchQuery}" within ${client.radius || 1500}m`);
  const rawCompetitors = await searchNearby(config.outscraper, searchQuery, client.lat, client.lng, client.radius || 1500);
  console.log(`[BRIEFING] Found ${rawCompetitors.length} businesses nearby`);

  // Step 2: Fetch own reviews
  console.log("[BRIEFING] Fetching your reviews...");
  const ownData = await fetchReviews(config.outscraper, `${client.name} ${client.address}`, 10);
  console.log(`[BRIEFING] Got ${ownData.reviews.length} reviews for ${client.name}`);

  // Step 3: Filter out own business, get top competitors
  const topCompetitors = rawCompetitors
    .filter((c) => c.name && c.name.toLowerCase() !== client.name.toLowerCase())
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  // Step 4: Fetch top competitor reviews
  for (const comp of topCompetitors.slice(0, 3)) {
    try {
      console.log(`[BRIEFING] Fetching reviews for ${comp.name}...`);
      const compData = await fetchReviews(config.outscraper, comp.place_id || comp.name + " " + (comp.full_address || "Toronto"), 5);
      comp.recentReviews = compData.reviews;
      comp.totalReviews = compData.totalReviews;
    } catch (e) {
      console.error(`[BRIEFING] Review fetch failed for ${comp.name}:`, e.message);
      comp.recentReviews = [];
    }
  }

  // Step 5: Generate AI briefing
  console.log("[BRIEFING] Generating AI briefing...");
  const briefingText = await generateBriefing(config.anthropic, client, ownData, topCompetitors);
  console.log(`[BRIEFING] Generated (${briefingText.length} chars)`);

  // Step 6: Send SMS
  const smsSent = [];
  
  // Check if SMS is enabled and start date has passed
  const smsActive = client.smsEnabled === "on";
  const startDatePassed = !client.smsStartDate || new Date(client.smsStartDate) <= new Date();
  const shouldSendOwner = smsActive && startDatePassed && client.ownerPhone;

  // Send to business owner (only if SMS enabled + start date passed)
  if (shouldSendOwner) {
    try {
      console.log(`[BRIEFING] SMS to owner (${client.ownerName || "Owner"}): ${client.ownerPhone}`);
      const sid = await sendSMS(config.twilio, client.ownerPhone, briefingText);
      console.log(`[BRIEFING] Owner SMS sent: ${sid}`);
      smsSent.push({ to: client.ownerName || "Owner", phone: client.ownerPhone, sid });
    } catch (e) {
      console.error(`[BRIEFING] Owner SMS failed:`, e.message);
      smsSent.push({ to: client.ownerName || "Owner", phone: client.ownerPhone, error: e.message });
    }
  } else if (client.ownerPhone) {
    const reason = !smsActive ? "SMS disabled" : !startDatePassed ? `Starts ${client.smsStartDate}` : "No phone";
    console.log(`[BRIEFING] Owner SMS skipped: ${reason}`);
    smsSent.push({ to: client.ownerName || "Owner", phone: client.ownerPhone, skipped: reason });
  }

  // Send admin copy
  if (config.adminPhone) {
    try {
      console.log(`[BRIEFING] SMS to admin: ${config.adminPhone}`);
      const sid = await sendSMS(config.twilio, config.adminPhone, `[ADMIN] ${briefingText}`);
      console.log(`[BRIEFING] Admin SMS sent: ${sid}`);
      smsSent.push({ to: "Admin", phone: config.adminPhone, sid });
    } catch (e) {
      console.error(`[BRIEFING] Admin SMS failed:`, e.message);
      smsSent.push({ to: "Admin", phone: config.adminPhone, error: e.message });
    }
  }

  return { success: true, smsSent, briefing: briefingText, competitorsFound: topCompetitors.length, ownRating: ownData.rating, ownReviewCount: ownData.reviews.length };
}

// ─── Run all clients ───
async function runAllBriefings() {
  const config = getConfig();
  const clients = loadClients();
  
  if (clients.length === 0) {
    console.log("[BRIEFING] No clients configured.");
    return [{ client: "None", success: false, error: "No clients configured. Add one in the admin page." }];
  }

  const results = [];
  console.log(`\n${"=".repeat(50)}`);
  console.log(`TurfWatch Briefing — ${new Date().toLocaleString()}`);
  console.log(`Clients: ${clients.length} | Admin: ${config.adminPhone || "not set"}`);
  console.log(`${"=".repeat(50)}`);

  for (const client of clients) {
    try {
      const result = await runBriefing(client, config);
      results.push({ client: client.name, ...result });
    } catch (e) {
      console.error(`[BRIEFING ERROR] ${client.name}:`, e.message);
      results.push({ client: client.name, success: false, error: e.message });
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log("Complete.");
  results.forEach((r) => console.log(`  ${r.success ? "OK" : "FAIL"} ${r.client} ${r.error || ""}`));
  console.log(`${"=".repeat(50)}\n`);

  return results;
}

// ─── Send test SMS to admin only ───
async function sendAdminTest() {
  const config = getConfig();
  if (!config.adminPhone) throw new Error("ADMIN_PHONE not set in environment variables");
  if (!config.twilio.sid) throw new Error("TWILIO_ACCOUNT_SID not set");
  
  const testMsg = `TurfWatch System Test\n\nSMS delivery is working.\nTime: ${new Date().toLocaleString()}\nClients configured: ${loadClients().length}\nOutscraper: ${config.outscraper ? "OK" : "MISSING"}\nAnthropic: ${config.anthropic ? "OK" : "MISSING"}`;
  
  const sid = await sendSMS(config.twilio, config.adminPhone, testMsg);
  return { success: true, sid, phone: config.adminPhone, message: testMsg };
}

module.exports = { runAllBriefings, runBriefing, loadClients, saveClients, sendAdminTest };
