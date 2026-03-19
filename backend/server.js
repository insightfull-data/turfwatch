require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.OUTSCRAPER_API_KEY;

// ─── Middleware ───
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5500"];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(ao => origin.startsWith(ao))) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  }
}));
app.use(express.json());

// Simple rate limiter — 30 requests per minute
const rateLimiter = {
  requests: [],
  limit: 30,
  window: 60000,
  check() {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.window);
    if (this.requests.length >= this.limit) return false;
    this.requests.push(now);
    return true;
  },
};

function rateLimit(req, res, next) {
  if (!rateLimiter.check()) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
  }
  next();
}

// ─── Health check ───
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ─── Validate API key on connect ───
app.post("/api/validate", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) {
    return res.status(400).json({ error: "No API key provided" });
  }
  try {
    // Lightweight search to validate the key
    const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent("barbershop")}&coordinates=43.6832,-79.2648&radius=500&limit=1&async=false`;
    const response = await fetch(url, {
      headers: { "X-API-KEY": key },
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `Outscraper API error: ${response.status}`,
        detail: text,
      });
    }
    const data = await response.json();
    res.json({ valid: true, message: "API key is valid" });
  } catch (e) {
    console.error("Validation error:", e.message);
    res.status(500).json({ error: "Failed to validate API key", detail: e.message });
  }
});

// ─── Search for businesses ───
app.post("/api/search", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });

  const { query, lat, lng, radius = 1500, limit = 15 } = req.body;

  try {
    const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(
      query || "barbershop OR barber OR salon OR grooming"
    )}&coordinates=${lat || 43.6832},${lng || -79.2648}&radius=${radius}&limit=${limit}&async=false`;

    console.log(`[SEARCH] ${query} near ${lat},${lng} radius=${radius}`);

    const response = await fetch(url, {
      headers: { "X-API-KEY": key },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[SEARCH ERROR] ${response.status}: ${text}`);
      return res.status(response.status).json({ error: `Outscraper error: ${response.status}`, detail: text });
    }

    const data = await response.json();

    // Normalize the response — Outscraper v3 returns data in nested arrays
    const results = data.data || [];
    const businesses = Array.isArray(results[0]) ? results[0] : results;

    // Normalize each business to a consistent shape
    const normalized = businesses.map((b) => ({
      name: b.name || "",
      address: b.full_address || b.address || "",
      lat: b.latitude || 0,
      lng: b.longitude || 0,
      rating: b.rating || 0,
      reviewCount: b.reviews_count || b.reviews || 0,
      placeId: b.place_id || b.google_id || "",
      type: b.type || "",
      subtypes: b.subtypes || [],
      description: b.description || b.about?.summary || "",
      phone: b.phone || "",
      website: b.site || b.website || "",
      hours: b.working_hours || null,
      photos: (b.photos_sample || []).slice(0, 3).map((p) => p.photo_url || p),
    }));

    console.log(`[SEARCH] Found ${normalized.length} businesses`);
    res.json({ businesses: normalized });
  } catch (e) {
    console.error("[SEARCH ERROR]", e.message);
    res.status(500).json({ error: "Search failed", detail: e.message });
  }
});

// ─── Fetch reviews for a business ───
app.post("/api/reviews", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });

  const { query, limit = 10 } = req.body;
  if (!query) return res.status(400).json({ error: "No query (placeId or business name) provided" });

  try {
    const url = `https://api.app.outscraper.com/maps/reviews-v3?query=${encodeURIComponent(
      query
    )}&reviewsLimit=${limit}&async=false`;

    console.log(`[REVIEWS] Fetching ${limit} reviews for: ${query}`);

    const response = await fetch(url, {
      headers: { "X-API-KEY": key },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[REVIEWS ERROR] ${response.status}: ${text}`);
      return res.status(response.status).json({ error: `Outscraper error: ${response.status}`, detail: text });
    }

    const data = await response.json();

    // Normalize response
    const results = data.data || [];
    const flat = Array.isArray(results[0]) ? results[0] : results;
    const businessData = flat[0] || flat;

    // Extract business-level info
    const businessInfo = {
      name: businessData.name || "",
      rating: businessData.rating || 0,
      totalReviews: businessData.reviews_count || businessData.reviews || 0,
      address: businessData.full_address || businessData.address || "",
    };

    // Extract and normalize reviews
    const rawReviews = businessData.reviews_data || businessData.reviews_data || [];
    const reviews = (Array.isArray(rawReviews) ? rawReviews : [])
      .map((r) => ({
        author: r.author_title || r.author_name || r.author || "Anonymous",
        authorImage: r.author_image || "",
        rating: r.review_rating || r.rating || 0,
        date: r.review_datetime_utc || r.review_date || "",
        dateRelative: r.review_relative_date || "",
        text: r.review_text || r.text || r.body || "",
        reviewId: r.review_id || "",
        likes: r.review_likes || 0,
        ownerResponse: r.owner_answer || r.owner_response || null,
      }))
      .filter((r) => r.text); // Only keep reviews with actual text

    console.log(`[REVIEWS] Got ${reviews.length} reviews for ${businessInfo.name}`);
    res.json({ business: businessInfo, reviews });
  } catch (e) {
    console.error("[REVIEWS ERROR]", e.message);
    res.status(500).json({ error: "Review fetch failed", detail: e.message });
  }
});

// ─── Geocode an address using Outscraper ───
app.post("/api/geocode", rateLimit, async (req, res) => {
  const key = req.body.apiKey || API_KEY;
  if (!key) return res.status(400).json({ error: "No API key" });

  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "No address provided" });

  try {
    console.log(`[GEOCODE] Geocoding: ${address}`);
    const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(address)}&limit=1&async=false`;
    const response = await fetch(url, { headers: { "X-API-KEY": key } });
    if (!response.ok) throw new Error(`Outscraper error: ${response.status}`);
    const data = await response.json();
    const results = data.data || [];
    const flat = Array.isArray(results[0]) ? results[0] : results;
    
    if (flat.length > 0) {
      const place = flat[0];
      res.json({
        lat: place.latitude,
        lng: place.longitude,
        formattedAddress: place.full_address || place.address || address,
        name: place.name || "",
        placeId: place.place_id || "",
        rating: place.rating || 0,
        reviewCount: place.reviews_count || place.reviews || 0,
      });
    } else {
      res.status(404).json({ error: "Address not found" });
    }
  } catch (e) {
    console.error("[GEOCODE ERROR]", e.message);
    res.status(500).json({ error: "Geocoding failed", detail: e.message });
  }
});

// ─── Classify businesses as competitors (via Claude API) ───
app.post("/api/classify", rateLimit, async (req, res) => {
  const { businesses, clientName, clientAddress, clientType } = req.body;
  if (!businesses || !Array.isArray(businesses)) {
    return res.status(400).json({ error: "No businesses array provided" });
  }

  const shopDesc = `${clientName || "a barbershop"} at ${clientAddress || "1006 Kingston Rd, Toronto"}`;
  const bizType = clientType || "barbershop";

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  // If no Anthropic key, use keyword-based fallback
  if (!ANTHROPIC_API_KEY) {
    console.log("[CLASSIFY] No Anthropic key — using keyword classifier");
    const competitorTypes = ["barber", "barbershop", "hair", "salon", "grooming", "fade", "cut", "shave", "stylist"];
    const nonCompetitorTypes = ["nail", "spa", "wax", "lash", "brow", "tattoo", "piercing", "pet", "dog", "cat"];
    const results = businesses.map(b => {
      const text = ((b.name || "") + " " + (b.type || "") + " " + (b.subtypes?.join(" ") || "") + " " + (b.description || "")).toLowerCase();
      const isNon = nonCompetitorTypes.some(t => text.includes(t));
      const isComp = competitorTypes.some(t => text.includes(t));
      if (isNon && !isComp) return { name: b.name, isCompetitor: false, reason: "Different service category", threat: "low" };
      if (isComp) return { name: b.name, isCompetitor: true, reason: "Overlapping grooming/hair services", threat: "medium" };
      return { name: b.name, isCompetitor: true, reason: "Potential competitor — review manually", threat: "medium" };
    });
    return res.json({ classifications: results });
  }

  try {
    console.log(`[CLASSIFY] Classifying ${businesses.length} businesses via Claude`);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You classify businesses as competitors to ${shopDesc} (a ${bizType}). A competitor is any business whose services overlap enough to potentially take clients. Respond ONLY with JSON array, no other text: [{"name":"...","isCompetitor":true/false,"reason":"brief explanation","threat":"high|medium|low"}]`,
        messages: [{ role: "user", content: JSON.stringify(businesses.map(b => ({ name: b.name, types: b.type || b.subtypes, description: b.description || "" }))) }],
      }),
    });
    const data = await response.json();
    const raw = data.content?.map(i => i.text || "").join("") || "[]";
    const classifications = JSON.parse(raw.replace(/```json|```/g, "").trim());
    console.log(`[CLASSIFY] Classified ${classifications.length} businesses`);
    res.json({ classifications });
  } catch (e) {
    console.error("[CLASSIFY ERROR]", e.message);
    // Fallback to keyword classifier
    const competitorTypes = ["barber", "barbershop", "hair", "salon", "grooming", "fade", "cut", "shave", "stylist"];
    const nonCompetitorTypes = ["nail", "spa", "wax", "lash", "brow", "tattoo", "piercing", "pet", "dog", "cat"];
    const results = businesses.map(b => {
      const text = ((b.name || "") + " " + (b.type || "") + " " + (b.subtypes?.join(" ") || "") + " " + (b.description || "")).toLowerCase();
      const isNon = nonCompetitorTypes.some(t => text.includes(t));
      const isComp = competitorTypes.some(t => text.includes(t));
      if (isNon && !isComp) return { name: b.name, isCompetitor: false, reason: "Different service category", threat: "low" };
      if (isComp) return { name: b.name, isCompetitor: true, reason: "Overlapping grooming/hair services", threat: "medium" };
      return { name: b.name, isCompetitor: true, reason: "Potential competitor — review manually", threat: "medium" };
    });
    res.json({ classifications: results });
  }
});

// ─── Analyze reviews (via Claude API) ───
app.post("/api/analyze", rateLimit, async (req, res) => {
  const { reviews, businessName, isOwn, clientName, clientAddress } = req.body;
  if (!reviews || !Array.isArray(reviews)) {
    return res.status(400).json({ error: "No reviews array provided" });
  }

  const shopDesc = `${clientName || "a barbershop"} at ${clientAddress || "1006 Kingston Rd, Toronto"}`;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: "No Anthropic API key configured. Add ANTHROPIC_API_KEY to environment variables." });
  }

  try {
    console.log(`[ANALYZE] Analyzing ${reviews.length} reviews for ${businessName || "own shop"}`);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: isOwn
          ? `Analyze these Google reviews for ${shopDesc}. This is the OWNER's shop. Identify: sentiment trend, recurring themes, service gaps clients mention, competitive threats (other shops mentioned), and specific actionable improvements. Respond ONLY with JSON: {"overallSentiment":"positive|mixed|negative","avgRating":0,"themes":[{"theme":"...","count":0,"sentiment":"positive|negative|neutral"}],"competitorMentions":["..."],"actionItems":["..."],"summary":"2 sentence summary"}`
          : `Analyze these Google reviews for "${businessName}", a competitor to ${shopDesc}. Identify: what clients love (to learn from), what they hate (opportunities to exploit), pricing sentiment, and any signs of client switching. Respond ONLY with JSON: {"overallSentiment":"positive|mixed|negative","avgRating":0,"strengths":["..."],"weaknesses":["..."],"pricingSentiment":"...","switchingSignals":["..."],"exploitableGaps":["..."],"summary":"2 sentence summary"}`,
        messages: [{ role: "user", content: JSON.stringify(reviews.slice(0, 15)) }],
      }),
    });
    const data = await response.json();
    const raw = data.content?.map(i => i.text || "").join("") || "{}";
    const analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
    console.log(`[ANALYZE] Analysis complete for ${businessName || "own shop"}`);
    res.json({ analysis });
  } catch (e) {
    console.error("[ANALYZE ERROR]", e.message);
    res.status(500).json({ error: "Analysis failed", detail: e.message });
  }
});

// ─── Analyze field report (via Claude API) ───
app.post("/api/report", rateLimit, async (req, res) => {
  const { text, competitorCount, threatScore, clientName, clientAddress } = req.body;
  if (!text) return res.status(400).json({ error: "No report text provided" });

  const shopDesc = `${clientName || "a barbershop"} at ${clientAddress || "1006 Kingston Rd, Toronto"}`;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: "No Anthropic API key configured." });
  }

  try {
    console.log(`[REPORT] Analyzing field report: "${text.substring(0, 50)}..."`);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You are TurfWatch AI for ${shopDesc}. Context: ${competitorCount || 5} competitors within the scan radius, threat score ${threatScore || 72}/100. Analyze the owner's observation. Respond ONLY JSON: {"cat":"New Competitor|Demographic Shift|Service Gap|Foot Traffic|Pricing Signal|Partnership|Trend","threat":"high|medium|low|opportunity","insights":["1","2","3"],"rec":"one action","impact":<-5 to +5>}`,
        messages: [{ role: "user", content: text }],
      }),
    });
    const data = await response.json();
    const raw = data.content?.map(i => i.text || "").join("") || "{}";
    const analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
    console.log(`[REPORT] Analysis complete`);
    res.json({ analysis });
  } catch (e) {
    console.error("[REPORT ERROR]", e.message);
    res.status(500).json({ error: "Report analysis failed", detail: e.message });
  }
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  TurfWatch API Proxy                     ║
  ║  Running on http://localhost:${PORT}        ║
  ║  API Key: ${API_KEY ? "✓ Configured" : "✗ Missing — set OUTSCRAPER_API_KEY in .env"}       ║
  ╚══════════════════════════════════════════╝
  `);
});
