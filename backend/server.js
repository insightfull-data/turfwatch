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
