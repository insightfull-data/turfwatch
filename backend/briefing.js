// ═══════════════════════════════════════════════════════════
// TurfWatch SMS Briefing Engine

const fetch = require("node-fetch");

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
    // Client list — start with one, add more as you grow
    clients: JSON.parse(process.env.CLIENTS_JSON || "[]"),
  };
}

// Default client if CLIENTS_JSON not set
const DEFAULT_CLIENTS = [
  {
    name: "Cut N Run Barbershop",
    address: "1006 Kingston Rd, Toronto",
    phone: "", // SET THIS in CLIENTS_JSON env var
    lat: 43.6832,
    lng: -79.2648,
    radius: 1500,
    type: "barbershop",
  },
];

// ─── Outscraper: Search for competitors ───
async function searchCompetitors(apiKey, lat, lng, radius) {
  const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(
    "barbershop OR barber OR salon OR grooming"
  )}&coordinates=${lat},${lng}&radius=${radius}&limit=15&async=false`;

  const res = await fetch(url, { headers: { "X-API-KEY": apiKey } });
  if (!res.ok) throw new Error(`Outscraper search failed: ${res.status}`);
  const data = await res.json();
  const results = data.data || [];
  return Array.isArray(results[0]) ? results[0] : results;
}

// ─── Outscraper: Fetch reviews ───
async function fetchReviews(apiKey, query, limit = 10) {
  const url = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(
    query
  )}&reviewsLimit=${limit}&async=false`;

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

// ─── Claude: Generate the briefing ───
async function generateBriefing(anthropicKey, client, ownData, competitors) {
  const prompt = `You are TurfWatch, a competitive intelligence system for ${client.name} at ${client.address}.

Here is this week's data:

YOUR SHOP:
- Rating: ${ownData.rating}★ (${ownData.totalReviews} total reviews)
- Recent reviews: ${JSON.stringify(ownData.reviews.slice(0, 5))}

COMPETITORS FOUND (within ${(client.radius / 1000).toFixed(1)} km):
${competitors
  .map(
    (c) =>
      `- ${c.name}: ${c.rating}★ (${c.reviews_count || c.totalReviews || 0} reviews) — ${Array.isArray(c.subtypes) ? c.subtypes.join(", ") : (c.subtypes || c.type || "business")}`
  )
  .join("\n")}

TOP COMPETITOR REVIEWS THIS WEEK:
${competitors
  .slice(0, 3)
  .map(
    (c) =>
      `${c.name}: ${(c.recentReviews || [])
        .slice(0, 2)
        .map((r) => `"${r.text?.substring(0, 80)}..." (${r.rating}★)`)
        .join("; ")}`
  )
  .join("\n")}

Generate a weekly SMS briefing. STRICT RULES:
- Maximum 450 characters total (SMS limit)
- Use these EXACT sections in this EXACT order:
  ➜ DO THIS (one specific action he can do Monday in under 30 minutes — be concrete, not vague)
  💡 WHY (the data point or competitive shift that makes this urgent)
  ⚡ YOU vs THEM (your rating vs the most relevant competitor's rating — one line)
  📈 MOMENTUM: (one word: Rising / Holding / Slipping — plus a short reason)
- ACTION FIRST. The barber is an operator, not an analyst. Lead with what to do.
- Be specific — use actual competitor names, actual review quotes, actual numbers
- No fluff, no pleasantries, no "consider" or "think about" — direct commands

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
  const text = data.content?.map((i) => i.text || "").join("") || "";
  return `📡 TurfWatch — ${client.name}\n\n${text.trim()}`;
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

  const result = await res.json();
  return result.sid;
}

// ─── Main: Run briefing for one client ───
async function runBriefing(client, config) {
  console.log(`\n[BRIEFING] Starting for ${client.name}...`);

  // Step 1: Search for competitors
  console.log("[BRIEFING] Scanning competitors...");
  const rawCompetitors = await searchCompetitors(
    config.outscraper,
    client.lat,
    client.lng,
    client.radius
  );
  console.log(`[BRIEFING] Found ${rawCompetitors.length} businesses nearby`);

  // Step 2: Fetch own reviews
  console.log("[BRIEFING] Fetching your reviews...");
  const ownData = await fetchReviews(
    config.outscraper,
    `${client.name} ${client.address}`,
    10
  );
  console.log(`[BRIEFING] Got ${ownData.reviews.length} reviews for ${client.name}`);

  // Step 3: Fetch top competitor reviews
  const topCompetitors = rawCompetitors
    .filter((c) => c.name && c.name !== client.name)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  for (const comp of topCompetitors.slice(0, 3)) {
    try {
      console.log(`[BRIEFING] Fetching reviews for ${comp.name}...`);
      const compData = await fetchReviews(
        config.outscraper,
        comp.place_id || comp.name + " " + (comp.full_address || "Toronto"),
        5
      );
      comp.recentReviews = compData.reviews;
      comp.totalReviews = compData.totalReviews;
    } catch (e) {
      console.error(`[BRIEFING] Failed to fetch reviews for ${comp.name}:`, e.message);
      comp.recentReviews = [];
    }
  }

  // Step 4: Generate AI briefing
  console.log("[BRIEFING] Generating AI briefing...");
  const briefingText = await generateBriefing(
    config.anthropic,
    client,
    ownData,
    topCompetitors
  );
  console.log(`[BRIEFING] Generated (${briefingText.length} chars):`);
  console.log(briefingText);

  // Step 5: Send SMS
  if (client.phone) {
    console.log(`[BRIEFING] Sending SMS to ${client.phone}...`);
    const msgSid = await sendSMS(config.twilio, client.phone, briefingText);
    console.log(`[BRIEFING] ✓ SMS sent! SID: ${msgSid}`);
    return { success: true, msgSid, briefing: briefingText };
  } else {
    console.log("[BRIEFING] ⚠ No phone number — SMS not sent. Briefing generated only.");
    return { success: true, msgSid: null, briefing: briefingText, note: "No phone number configured" };
  }
}

// ─── Run all clients ───
async function runAllBriefings() {
  const config = getConfig();
  const clients = config.clients.length > 0 ? config.clients : DEFAULT_CLIENTS;
  const results = [];

  console.log(`\n${"═".repeat(50)}`);
  console.log(`TurfWatch Weekly Briefing — ${new Date().toLocaleDateString()}`);
  console.log(`Running for ${clients.length} client(s)`);
  console.log(`${"═".repeat(50)}`);

  for (const client of clients) {
    try {
      const result = await runBriefing(client, config);
      results.push({ client: client.name, ...result });
    } catch (e) {
      console.error(`[BRIEFING ERROR] ${client.name}:`, e.message);
      results.push({ client: client.name, success: false, error: e.message });
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log("Briefing complete.");
  results.forEach((r) => {
    console.log(`  ${r.success ? "✓" : "✗"} ${r.client} ${r.msgSid ? `(SMS: ${r.msgSid})` : r.note || r.error || ""}`);
  });
  console.log(`${"═".repeat(50)}\n`);

  return results;
}

module.exports = { runAllBriefings, runBriefing };
