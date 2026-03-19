const { useState, useEffect, useRef, useCallback } = React;

// ═══════════════════════════════════════════════════════════════════════
// TurfWatch v4 — Neighborhood Intelligence + Google Reviews Radar
// Outscraper API integration · AI competitor classification · Sentiment
// ═══════════════════════════════════════════════════════════════════════

const C = {
  bg: "#060710", surface: "#0c0e17", card: "#12141f", cardAlt: "#171a28",
  border: "#1b1e30", borderHi: "#262a40",
  gold: "#c9a035", goldBr: "#e2bc48", goldDim: "rgba(201,160,53,0.10)", goldGlow: "rgba(201,160,53,0.22)",
  red: "#d94040", redDim: "rgba(217,64,64,0.10)",
  green: "#2fa85c", greenDim: "rgba(47,168,92,0.10)",
  orange: "#d08530", orangeDim: "rgba(208,133,48,0.10)",
  blue: "#4a78d4", blueDim: "rgba(74,120,212,0.10)",
  purple: "#8b6cc7", purpleDim: "rgba(139,108,199,0.10)",
  text: "#d8d8e6", muted: "#6e7088", dim: "#3f4158",
};

// ─── Default client config (overwritten by setup) ───
const DEFAULT_CLIENT = { name: "", biz: "", address: "", lat: 0, lng: 0, radius: 1500, type: "barbershop", searchQuery: "" };

const BUSINESS_TYPES = [
  { value: "barbershop", label: "Barbershop" },
  { value: "hair_salon", label: "Hair Salon" },
  { value: "grooming", label: "Grooming / Spa" },
  { value: "beauty_salon", label: "Beauty Salon" },
  { value: "nail_salon", label: "Nail Salon" },
  { value: "other", label: "Other" },
];

const RADIUS_OPTIONS = [
  { value: 500, label: "0.5 km" },
  { value: 1000, label: "1.0 km" },
  { value: 1500, label: "1.5 km" },
  { value: 2000, label: "2.0 km" },
  { value: 3000, label: "3.0 km" },
];

// ─── Setup / Onboarding Screen ───
function SetupScreen({ onComplete, apiKey }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("barbershop");
  const [radius, setRadius] = useState(1500);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [error, setError] = useState("");

  const handleSetup = async () => {
    if (!name.trim() || !address.trim()) {
      setError("Please enter both shop name and address.");
      return;
    }
    setIsGeocoding(true);
    setError("");

    try {
      // Geocode the address via backend
      const res = await fetch(`${API_BASE}/api/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${name} ${address}`, apiKey }),
      });

      let lat, lng, formattedAddress;

      if (res.ok) {
        const data = await res.json();
        lat = data.lat;
        lng = data.lng;
        formattedAddress = data.formattedAddress || address;
      } else {
        // Fallback: try without shop name
        const res2 = await fetch(`${API_BASE}/api/geocode`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, apiKey }),
        });
        if (res2.ok) {
          const data2 = await res2.json();
          lat = data2.lat;
          lng = data2.lng;
          formattedAddress = data2.formattedAddress || address;
        } else {
          setError("Could not find that address. Please check and try again.");
          setIsGeocoding(false);
          return;
        }
      }

      const client = {
        name,
        biz: name,
        address: formattedAddress,
        lat,
        lng,
        radius: parseInt(radius),
        type,
        searchQuery: `${name} ${address}`,
      };

      // Save to localStorage
      localStorage.setItem("turfwatch_client", JSON.stringify(client));
      onComplete(client);
    } catch (e) {
      console.error("Setup error:", e);
      setError("Connection failed. Make sure the backend is running and try again.");
    }
    setIsGeocoding(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 420, width: "100%", animation: "fadeUp 0.5s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg,${C.gold},${C.goldBr})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: `0 0 30px ${C.goldDim}`, marginBottom: 16 }}>📡</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, background: `linear-gradient(135deg,${C.goldBr},#f5e6b8)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'DM Sans', sans-serif" }}>TurfWatch</h1>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Neighborhood Intelligence Radar</p>
          <p style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Set up your business to start tracking competitors</p>
        </div>

        {/* Form */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Business Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cut N Run Barbershop"
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
          </div>

          <div>
            <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Address *</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 1006 Kingston Rd, Toronto"
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }} />
          </div>

          <div>
            <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Business Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
              {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, display: "block", marginBottom: 6 }}>Scan Radius</label>
            <select value={radius} onChange={e => setRadius(e.target.value)}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
              {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {error && (
            <div style={{ padding: "8px 12px", background: C.redDim, borderRadius: 8, fontSize: 11, color: C.red, border: `1px solid ${C.red}25` }}>{error}</div>
          )}

          <button onClick={handleSetup} disabled={isGeocoding || !name.trim() || !address.trim()} style={{
            width: "100%", padding: "12px 0", fontSize: 13, fontWeight: 700,
            background: name.trim() && address.trim() && !isGeocoding ? `linear-gradient(135deg,${C.gold},${C.goldBr})` : C.dim,
            color: name.trim() && address.trim() ? C.bg : C.muted,
            border: "none", borderRadius: 8, cursor: name.trim() && address.trim() ? "pointer" : "default",
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
          }}>{isGeocoding ? "Finding your location..." : "Launch TurfWatch →"}</button>
        </div>

        <p style={{ fontSize: 9, color: C.dim, textAlign: "center", marginTop: 16 }}>
          Your data is stored locally in your browser. No account needed.
        </p>
      </div>
    </div>
  );
}

// ─── Mock Data ───

const MOCK_COMPETITORS = [
  { id: "fc1", name: "Fresh Cutz Barber", addr: "1052 Kingston Rd", dist: 0.3, lat: 43.6851, lng: -79.2598, rating: 4.3, reviews: 47, opened: "Mar 2025", price: "$$", services: "Fades, lineups, modern styles", threat: "high", isCompetitor: true, aiReason: "Direct competitor — identical target demographic, modern fades focus, 300m away" },
  { id: "kc2", name: "Kingston Clip Joint", addr: "920 Kingston Rd", dist: 0.5, lat: 43.6818, lng: -79.2570, rating: 4.1, reviews: 23, opened: "Nov 2024", price: "$", services: "Traditional cuts, shaves", threat: "medium", isCompetitor: true, aiReason: "Overlapping services — traditional cuts at lower price point could attract budget-conscious clients" },
  { id: "bb3", name: "Birch & Blade", addr: "1120 Kingston Rd", dist: 0.7, lat: 43.6862, lng: -79.2710, rating: 4.7, reviews: 89, opened: "Jan 2025", price: "$$$", services: "Premium grooming, beard sculpting, hot towel shaves", threat: "high", isCompetitor: true, aiReason: "Premium positioning pulling high-value clients — 3 clients/week asking about their beard services" },
  { id: "qe4", name: "Queen East Barbers", addr: "850 Kingston Rd", dist: 1.1, lat: 43.6795, lng: -79.2530, rating: 3.9, reviews: 156, opened: "2019", price: "$", services: "Walk-ins, classic cuts", threat: "low", isCompetitor: true, aiReason: "Established but declining ratings — walk-in model less relevant to appointment-based clientele" },
  { id: "gc5", name: "The Grooming Co.", addr: "1180 Kingston Rd", dist: 1.4, lat: 43.6870, lng: -79.2760, rating: 4.5, reviews: 62, opened: "Sep 2024", price: "$$$", services: "Full service grooming, skincare, facials", threat: "medium", isCompetitor: true, aiReason: "Partial overlap — grooming/skincare pulls clients seeking premium, but facial focus differentiates" },
  { id: "hs6", name: "Hair Story Salon", addr: "980 Kingston Rd", dist: 0.4, lat: 43.6828, lng: -79.2585, rating: 4.4, reviews: 210, opened: "2017", price: "$$", services: "Women's cuts, color, blowouts", threat: null, isCompetitor: false, aiReason: "Not a competitor — women's salon with no overlapping services or male clientele" },
  { id: "ns7", name: "Nails & Spa Kingston", addr: "1040 Kingston Rd", dist: 0.3, lat: 43.6845, lng: -79.2610, rating: 4.2, reviews: 95, opened: "2020", price: "$$", services: "Manicures, pedicures, waxing", threat: null, isCompetitor: false, aiReason: "Not a competitor — entirely different service category, no client overlap" },
];

const MOCK_OWN_REVIEWS = [
  { author: "Mike T.", rating: 5, date: "Mar 15, 2026", text: "Best barbershop on Kingston Road. Been coming here for 3 years and the quality never drops. Ask for Danny — he's the GOAT.", sentiment: "positive", themes: ["consistency", "specific barber loyalty"] },
  { author: "Jason L.", rating: 4, date: "Mar 12, 2026", text: "Good haircut as always. Only reason it's not 5 stars is the wait time on Saturdays can be brutal. Maybe open a bit earlier?", sentiment: "mixed", themes: ["wait times", "weekend hours"] },
  { author: "Chris R.", rating: 5, date: "Mar 8, 2026", text: "Just moved to the neighborhood from downtown. Tried this place on a whim and I'm hooked. Friendly, quick, and priced right.", sentiment: "positive", themes: ["new resident", "pricing", "friendly"] },
  { author: "David K.", rating: 3, date: "Mar 3, 2026", text: "Decent cut but I wish they offered beard grooming services. Had to go to Birch & Blade down the road for that. Would be great if they added it.", sentiment: "negative", themes: ["service gap", "competitor mention", "beard services"] },
  { author: "Alex M.", rating: 5, date: "Feb 28, 2026", text: "This is a real neighborhood spot. None of that overpriced hipster stuff. Just a great haircut from people who know what they're doing.", sentiment: "positive", themes: ["authenticity", "value", "skill"] },
  { author: "Tom W.", rating: 4, date: "Feb 20, 2026", text: "Solid as always. Parking can be tough on Kingston though.", sentiment: "mixed", themes: ["parking", "consistency"] },
];

const MOCK_COMPETITOR_REVIEWS = {
  fc1: [
    { author: "Ryan B.", rating: 5, date: "Mar 16, 2026", text: "Sick fades. These guys know what's up. Modern vibe, great music, quick service.", sentiment: "positive", themes: ["fades", "atmosphere", "speed"] },
    { author: "Jake P.", rating: 3, date: "Mar 10, 2026", text: "Style is on point but they're always pushing add-ons. Felt more like a sales pitch than a haircut.", sentiment: "negative", themes: ["upselling", "pressure"] },
    { author: "Marcus D.", rating: 4, date: "Mar 5, 2026", text: "Just opened and already packed. Good sign. Lineups are their specialty.", sentiment: "positive", themes: ["popular", "lineups"] },
  ],
  bb3: [
    { author: "James H.", rating: 5, date: "Mar 14, 2026", text: "The hot towel shave experience here is unreal. Worth every penny. This is what barbering should be.", sentiment: "positive", themes: ["hot towel shave", "premium experience", "value for money"] },
    { author: "Steve C.", rating: 5, date: "Mar 9, 2026", text: "Beard sculpting is an art form here. Switched from my old barber specifically for this service.", sentiment: "positive", themes: ["beard sculpting", "client switching", "specialization"] },
    { author: "Paul N.", rating: 4, date: "Mar 1, 2026", text: "Excellent grooming but the pricing is steep. $65 for a cut and beard is a lot for Kingston Rd.", sentiment: "mixed", themes: ["pricing concern", "quality acknowledged"] },
  ],
  kc2: [
    { author: "Greg F.", rating: 4, date: "Mar 11, 2026", text: "No frills, good price, solid cut. Exactly what I need.", sentiment: "positive", themes: ["value", "simplicity"] },
    { author: "Ed W.", rating: 3, date: "Feb 25, 2026", text: "Basic but fine. Nothing special. Would be nice if they updated the interior a bit.", sentiment: "mixed", themes: ["dated interior", "basic service"] },
  ],
  gc5: [
    { author: "Daniel R.", rating: 5, date: "Mar 13, 2026", text: "The facial + haircut combo is genius. Left feeling like a new person. My wife noticed immediately.", sentiment: "positive", themes: ["facial combo", "transformation", "partner approval"] },
    { author: "Kevin S.", rating: 4, date: "Mar 6, 2026", text: "Great concept but took almost 2 hours for the full service. Need to manage time better.", sentiment: "mixed", themes: ["long wait", "time management"] },
  ],
  qe4: [
    { author: "Bill M.", rating: 2, date: "Mar 7, 2026", text: "Used to be my go-to but quality has really slipped. Last two cuts were uneven. Time to find somewhere new.", sentiment: "negative", themes: ["declining quality", "client loss", "consistency issues"] },
    { author: "Rob A.", rating: 4, date: "Feb 15, 2026", text: "Walk-in friendly which is nice. But the vibe is a bit tired.", sentiment: "mixed", themes: ["walk-in friendly", "dated"] },
  ],
};

const MOCK_RATING_TRENDS = [
  { month: "Oct", you: 4.5, fc: 0, bb: 4.6, kc: 0, gc: 4.4, qe: 4.2 },
  { month: "Nov", you: 4.5, fc: 0, bb: 4.6, kc: 3.8, gc: 4.4, qe: 4.1 },
  { month: "Dec", you: 4.4, fc: 0, bb: 4.7, kc: 4.0, gc: 4.5, qe: 4.0 },
  { month: "Jan", you: 4.5, fc: 0, bb: 4.7, kc: 4.0, gc: 4.5, qe: 4.0 },
  { month: "Feb", you: 4.4, fc: 0, bb: 4.7, kc: 4.1, gc: 4.5, qe: 3.9 },
  { month: "Mar", you: 4.5, fc: 4.3, bb: 4.7, kc: 4.1, gc: 4.5, qe: 3.9 },
];

// ─── API Layer — calls TurfWatch proxy (avoids CORS) ───

// ═══ CHANGE THIS to your Railway URL after deploying ═══
const API_BASE = "https://turfwatch-production.up.railway.app";

async function apiValidate(apiKey) {
  const res = await fetch(`${API_BASE}/api/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Validation failed: ${res.status}`);
  }
  return res.json();
}

async function outscraperSearch(apiKey, query, lat, lng, radius = 1500) {
  const res = await fetch(`${API_BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, query, lat, lng, radius }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Search failed: ${res.status}`);
  }
  const data = await res.json();
  return data.businesses || [];
}

async function outscraperReviews(apiKey, query, limit = 10) {
  const res = await fetch(`${API_BASE}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, query, limit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Reviews failed: ${res.status}`);
  }
  const data = await res.json();
  return data; // { business, reviews }
}

async function classifyCompetitors(businesses, client) {
  try {
    const res = await fetch(`${API_BASE}/api/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businesses, clientName: client?.name, clientAddress: client?.address, clientType: client?.type }),
    });
    if (!res.ok) throw new Error(`Classification failed: ${res.status}`);
    const data = await res.json();
    return data.classifications || [];
  } catch (e) {
    console.error("Classification failed:", e);
    return businesses.map(b => ({ name: b.name, isCompetitor: true, reason: "Classification unavailable", threat: "medium" }));
  }
}

async function analyzeReviews(reviews, businessName, isOwn, client) {
  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviews, businessName, isOwn, clientName: client?.name, clientAddress: client?.address }),
    });
    if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
    const data = await res.json();
    return data.analysis || null;
  } catch (e) {
    console.error("Review analysis failed:", e);
    return null;
  }
}

// ─── Components ───

function Spinner({ size = 24, color = C.gold }) {
  return <div style={{ width: size, height: size, border: `3px solid ${C.border}`, borderTopColor: color, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
}

function Badge({ text, color, bg }) {
  return <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.2, color, background: bg, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>{text}</span>;
}

function Stars({ rating, size = 12 }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.3;
  return (
    <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
      {[...Array(5)].map((_, i) => (
        <span key={i} style={{ fontSize: size, color: i < full ? "#f0b429" : (i === full && half) ? "#f0b42980" : C.dim }}>★</span>
      ))}
      <span style={{ fontSize: size - 2, fontWeight: 700, color: C.text, marginLeft: 4, fontFamily: "'IBM Plex Mono', monospace" }}>{rating.toFixed(1)}</span>
    </span>
  );
}

function RatingChart({ data }) {
  const keys = [
    { k: "you", label: "You", color: C.goldBr },
    { k: "bb", label: "Birch&Blade", color: C.red },
    { k: "fc", label: "Fresh Cutz", color: C.orange },
    { k: "gc", label: "Grooming Co", color: C.blue },
    { k: "qe", label: "Queen East", color: C.green },
    { k: "kc", label: "Kingston Clip", color: C.purple },
  ];
  const minR = 3.5, maxR = 5.0, range = maxR - minR;
  const h = 140, w = 100;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>Rating Trends · 6 Month</div>
      <svg viewBox={`0 0 ${data.length * 60} ${h + 20}`} style={{ width: "100%", height: 160 }}>
        {/* Grid lines */}
        {[3.5, 4.0, 4.5, 5.0].map((v, i) => {
          const y = h - ((v - minR) / range) * h;
          return <g key={i}><line x1="0" y1={y} x2={data.length * 60} y2={y} stroke={C.border} strokeWidth="0.5" /><text x="-2" y={y + 3} fill={C.dim} fontSize="8" textAnchor="end">{v}</text></g>;
        })}
        {/* Lines */}
        {keys.map(({ k, color }) => {
          const pts = data.map((d, i) => d[k] > 0 ? `${i * 60 + 30},${h - ((d[k] - minR) / range) * h}` : null).filter(Boolean);
          return pts.length > 1 ? <polyline key={k} points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" opacity="0.85" strokeLinejoin="round" /> : null;
        })}
        {/* Dots */}
        {keys.map(({ k, color }) => data.map((d, i) => d[k] > 0 ? <circle key={`${k}${i}`} cx={i * 60 + 30} cy={h - ((d[k] - minR) / range) * h} r="3" fill={color} /> : null))}
        {/* Month labels */}
        {data.map((d, i) => <text key={i} x={i * 60 + 30} y={h + 16} fill={C.muted} fontSize="9" textAnchor="middle">{d.month}</text>)}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {keys.map(({ label, color }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.muted }}>
            <span style={{ width: 8, height: 3, borderRadius: 1, background: color, display: "inline-block" }} />{label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review, compact }) {
  const sentColor = review.sentiment === "positive" ? C.green : review.sentiment === "negative" ? C.red : C.orange;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: compact ? "8px 10px" : "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: C.text }}>{review.author}</span>
          <Stars rating={review.rating} size={compact ? 9 : 10} />
        </div>
        <span style={{ fontSize: 9, color: C.dim }}>{review.date}</span>
      </div>
      <p style={{ fontSize: compact ? 10.5 : 11.5, color: C.muted, lineHeight: 1.55, margin: "4px 0 6px" }}>"{review.text}"</p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(review.themes || []).map((t, j) => (
          <span key={j} style={{ fontSize: 8, color: sentColor, background: sentColor === C.green ? C.greenDim : sentColor === C.red ? C.redDim : C.orangeDim, padding: "2px 6px", borderRadius: 8, fontWeight: 600 }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function CompetitorMapLeaflet({ competitors, shop }) {
  const ref = useRef(null);
  const inst = useRef(null);
  useEffect(() => {
    // Always destroy old map so we re-render with new data
    if (inst.current) { inst.current.remove(); inst.current = null; }
    if (!ref.current) return;

    const initMap = () => {
      const L = window.L;
      if (!L) return;
      const m = L.map(ref.current, { center: [shop.lat, shop.lng], zoom: 14.5, zoomControl: false, attributionControl: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(m);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      const si = L.divIcon({ className: "", html: `<div style="width:20px;height:20px;border-radius:50%;background:${C.goldBr};border:3px solid #fff;box-shadow:0 0 18px ${C.goldGlow};"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
      L.marker([shop.lat, shop.lng], { icon: si }).addTo(m).bindPopup(`<b>✂️ YOUR SHOP</b><br>${shop.name}`);
      [500, 1000, 1500].forEach(r => L.circle([shop.lat, shop.lng], { radius: r, color: C.gold, weight: 1, opacity: 0.15, fillOpacity: 0.015, dashArray: "5 4" }).addTo(m));
      competitors.filter(c => c.isCompetitor && c.lat && c.lng).forEach(c => {
        const col = c.threat === "high" ? C.red : c.threat === "medium" ? C.orange : C.green;
        const ci = L.divIcon({ className: "", html: `<div style="width:12px;height:12px;border-radius:50%;background:${col};border:2px solid ${col}88;box-shadow:0 0 8px ${col}50;"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
        L.marker([c.lat, c.lng], { icon: ci }).addTo(m).bindPopup(`<div style="font-family:sans-serif;"><b>${c.name}</b><br><span style="color:#666;font-size:11px;">${c.services}</span><br><span style="color:${col};font-weight:700;font-size:11px;text-transform:uppercase;">${c.threat} threat</span> · ★${c.rating} · ${c.dist} km</div>`);
      });
      inst.current = m;
    };

    if (window.L) {
      initMap();
    } else {
      // Load Leaflet if not already loaded
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet"; link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
        document.head.appendChild(link);
      }
      if (!document.querySelector('script[src*="leaflet"]')) {
        const sc = document.createElement("script");
        sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
        sc.onload = initMap;
        document.head.appendChild(sc);
      } else {
        // Script tag exists but may still be loading
        const check = setInterval(() => { if (window.L) { clearInterval(check); initMap(); } }, 100);
        setTimeout(() => clearInterval(check), 5000);
      }
    }

    return () => { if (inst.current) { inst.current.remove(); inst.current = null; } };
  }, [competitors, shop]);

  return (
    <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
      <div ref={ref} style={{ width: "100%", height: 300 }} />
      <div style={{ position: "absolute", top: 8, left: 8, background: `${C.bg}dd`, borderRadius: 8, padding: "6px 10px", fontSize: 9, color: C.muted, backdropFilter: "blur(6px)", border: `1px solid ${C.border}`, zIndex: 400, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.goldBr, border: "2px solid #fff", display: "inline-block" }} /><span style={{ color: C.text, fontWeight: 600 }}>You</span></span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, display: "inline-block" }} />High</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.orange, display: "inline-block" }} />Medium</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />Low</span>
      </div>
    </div>
  );
}

// ─── TABS ───
const TABS = [
  { id: "dashboard", icon: "📊", l: "Overview" },
  { id: "reviews", icon: "⭐", l: "Reviews" },
  { id: "map", icon: "📍", l: "Map" },
  { id: "report", icon: "✏️", l: "Report" },
  { id: "settings", icon: "⚙️", l: "Settings" },
];

// ─── Main App ───

// Export for standalone rendering
window.TurfWatchApp = function TurfWatchRoot() {
  const [client, setClient] = useState(() => {
    try {
      const saved = localStorage.getItem("turfwatch_client");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [apiKey, setApiKeyRoot] = useState(() => {
    try { return localStorage.getItem("turfwatch_apikey") || ""; } catch { return ""; }
  });

  if (!client) {
    return React.createElement(SetupScreen, { onComplete: setClient, apiKey: apiKey });
  }
  return React.createElement(TurfWatchDashboard, { client, setClient, apiKeyInit: apiKey, setApiKeyRoot });
};

function TurfWatchDashboard({ client, setClient, apiKeyInit, setApiKeyRoot }) {
  const SHOP = client;
  const [tab, setTab] = useState("dashboard");
  const [apiKey, setApiKey] = useState(apiKeyInit || "");
  const saveApiKey = (key) => { setApiKey(key); try { localStorage.setItem("turfwatch_apikey", key); if (setApiKeyRoot) setApiKeyRoot(key); } catch {} };
  const [liveMode, setLiveMode] = useState(false);
  const [competitors, setCompetitors] = useState(MOCK_COMPETITORS);
  const [ownReviews, setOwnReviews] = useState(MOCK_OWN_REVIEWS);
  const [competitorReviews, setCompetitorReviews] = useState(MOCK_COMPETITOR_REVIEWS);
  const [ownAnalysis, setOwnAnalysis] = useState(null);
  const [compAnalyses, setCompAnalyses] = useState({});
  const [threatScore, setThreatScore] = useState(72);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [isAnalyzingReviews, setIsAnalyzingReviews] = useState(false);
  const [selectedComp, setSelectedComp] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportText, setReportText] = useState("");
  const [isAnalyzingReport, setIsAnalyzingReport] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [expandedStrategy, setExpandedStrategy] = useState(0);
  const textRef = useRef(null);
  const [lastScan, setLastScan] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState(null); // null | "connecting" | "connected" | "error"

  const activeCompetitors = competitors.filter(c => c.isCompetitor);
  const isLiveData = competitors !== MOCK_COMPETITORS && competitors.length > 0 && competitors[0]?.id?.startsWith("live_");
  
  // Computed: your shop's average rating from reviews
  const shopAvgRating = ownReviews.length > 0
    ? +(ownReviews.reduce((sum, r) => sum + r.rating, 0) / ownReviews.length).toFixed(1)
    : 4.5;

  // Computed: dynamic rating trends from live competitor data
  const ratingTrendsData = (() => {
    if (!isLiveData) return MOCK_RATING_TRENDS;
    // Build a single "current" data point from live ratings
    const current = { month: new Date().toLocaleString("en-US", { month: "short" }), you: shopAvgRating };
    activeCompetitors.forEach(c => {
      if (c.rating > 0) current[c.id] = c.rating;
    });
    return [current];
  })();

  // ─── Scan for competitors ───
  const handleScan = useCallback(async () => {
    setIsScanning(true);
    let discoveredCompetitors = null;
    if (apiKey) {
      try {
        setScanStatus("Searching Google Maps for nearby businesses...");
        const businesses = await outscraperSearch(apiKey, "barbershop OR barber OR salon OR grooming", SHOP.lat, SHOP.lng, SHOP.radius || 1500);
        setScanStatus(`Found ${businesses.length} businesses. AI classifying competitors...`);
        const classifications = await classifyCompetitors(businesses, SHOP);
        const merged = businesses.map((b, i) => {
          const cl = classifications.find(c => c.name === b.name) || {};
          return {
            id: `live_${i}`, name: b.name, addr: b.address, dist: 0,
            lat: b.lat, lng: b.lng, rating: b.rating || 0, reviews: b.reviewCount || 0,
            opened: "", price: "", services: b.subtypes?.join(", ") || b.type || "",
            threat: cl.threat || "medium", isCompetitor: cl.isCompetitor ?? true, aiReason: cl.reason || "",
            placeId: b.placeId || "",
          };
        });
        setCompetitors(merged);
        discoveredCompetitors = merged;
        setScanStatus(`Classified ${merged.filter(m => m.isCompetitor).length} competitors from ${businesses.length} businesses`);
      } catch (e) {
        console.error(e);
        setScanStatus("API error — falling back to demo data");
        setCompetitors(MOCK_COMPETITORS);
        discoveredCompetitors = MOCK_COMPETITORS;
      }
    } else {
      setScanStatus("No API key — using demo data. Add your Outscraper key in Settings.");
      await new Promise(r => setTimeout(r, 1500));
      setCompetitors(MOCK_COMPETITORS);
      discoveredCompetitors = MOCK_COMPETITORS;
      setScanStatus(`Found ${MOCK_COMPETITORS.filter(c => c.isCompetitor).length} competitors (demo mode)`);
    }
    setLastScan(new Date().toLocaleString());
    setIsScanning(false);
    return discoveredCompetitors; // Return so callers can use fresh data immediately
  }, [apiKey]);

  // ─── Fetch & analyze reviews ───
  const handleReviewScan = useCallback(async (competitorsOverride) => {
    setIsAnalyzingReviews(true);
    setScanStatus("");
    let liveOwnReviews = null;
    let liveCompReviews = {};

    // Use override if provided (from connect flow), otherwise use current state
    const compsToUse = (competitorsOverride || competitors).filter(c => c.isCompetitor);

    if (apiKey) {
      try {
        // Step 1: Fetch own shop reviews
        setScanStatus("Fetching your Google reviews...");
        try {
          const result = await outscraperReviews(apiKey, SHOP.searchQuery, 15);
          const revs = (result.reviews || []).map(r => ({
            author: r.author,
            rating: r.rating,
            date: r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : r.dateRelative || "",
            text: r.text,
            sentiment: r.rating >= 4 ? "positive" : r.rating >= 3 ? "mixed" : "negative",
            themes: [],
          }));
          if (revs.length > 0) {
            liveOwnReviews = revs;
            setOwnReviews(revs);
            setScanStatus(`Fetched ${revs.length} of your reviews.`);
          } else {
            setScanStatus("No reviews found for your shop — using existing data.");
          }
        } catch (e) { console.error("Own review fetch failed:", e); setScanStatus("Could not fetch your reviews — will use existing data."); }

        // Step 2: Fetch competitor reviews
        const compsToFetch = compsToUse.filter(c => c.threat === "high" || c.threat === "medium");
        for (let idx = 0; idx < compsToFetch.length; idx++) {
          const comp = compsToFetch[idx];
          const query = comp.placeId || (comp.name + " " + (comp.addr || "Kingston Rd Toronto"));
          setScanStatus(`Fetching reviews for ${comp.name} (${idx + 1}/${compsToFetch.length})...`);
          try {
            const result = await outscraperReviews(apiKey, query, 10);
            const revs = (result.reviews || []).map(r => ({
              author: r.author,
              rating: r.rating,
              date: r.date ? new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : r.dateRelative || "",
              text: r.text,
              sentiment: r.rating >= 4 ? "positive" : r.rating >= 3 ? "mixed" : "negative",
              themes: [],
            }));
            if (revs.length > 0) {
              liveCompReviews[comp.id] = revs;
            }
          } catch (e) { console.error(`Review fetch failed for ${comp.name}:`, e); }
        }
        if (Object.keys(liveCompReviews).length > 0) {
          setCompetitorReviews(prev => ({ ...prev, ...liveCompReviews }));
        }
        setScanStatus(`Fetched reviews. Running AI analysis...`);
      } catch (e) {
        console.error("Review pipeline error:", e);
        setScanStatus("Some review fetches failed — analyzing available data.");
      }
    } else {
      setScanStatus("No API key — analyzing demo reviews. Add key in Settings for live data.");
    }

    // Step 3: AI analysis on whatever reviews we have (live or mock)
    const reviewsToAnalyzeOwn = liveOwnReviews || ownReviews;
    const oa = await analyzeReviews(reviewsToAnalyzeOwn, SHOP.biz || SHOP.name, true, SHOP);
    setOwnAnalysis(oa);

    // Analyze competitors (high-threat first, then medium)
    const compsForAnalysis = compsToUse.filter(c => c.threat === "high" || c.threat === "medium");
    for (const comp of compsForAnalysis) {
      const revs = liveCompReviews[comp.id] || competitorReviews[comp.id] || [];
      if (revs.length > 0) {
        setScanStatus(`AI analyzing ${comp.name}...`);
        const ca = await analyzeReviews(revs, comp.name, false, SHOP);
        setCompAnalyses(prev => ({ ...prev, [comp.id]: ca }));
      }
    }

    setScanStatus(apiKey ? `Live review analysis complete.` : `Demo review analysis complete.`);
    setLastScan(new Date().toLocaleString());
    setIsAnalyzingReviews(false);
  }, [apiKey, ownReviews, competitors, competitorReviews]);

  // ─── Field report ───
  const handleReport = async () => {
    if (!reportText.trim()) return;
    setIsAnalyzingReport(true); setReportResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reportText, competitorCount: activeCompetitors.length, threatScore, clientName: SHOP.name, clientAddress: SHOP.address }),
      });
      if (!res.ok) throw new Error(`Report failed: ${res.status}`);
      const d = await res.json();
      const parsed = d.analysis;
      const nr = { id: Date.now(), date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), text: reportText, ai: parsed };
      setReportResult(nr);
      setReports(p => [nr, ...p]);
      setThreatScore(p => Math.max(0, Math.min(100, p + (parsed.impact || 0))));
      setReportText("");
    } catch (e) { console.error(e); setReportResult({ error: true }); }
    setIsAnalyzingReport(false);
  };

  const STRATEGIES = [
    { p: "URGENT", c: C.red, bg: C.redDim, t: "Counter High-Threat Competitors", d: `${activeCompetitors.filter(c => c.threat === "high").length} high-threat shops within 0.7 km targeting your demographic.`, a: ["Launch loyalty program before clients experiment", "Add premium beard/grooming to match Birch & Blade", "Extend hours to 8 PM — foot traffic peaks at 5-6 PM"] },
    { p: "STRATEGIC", c: C.gold, bg: C.goldDim, t: "Capture the Condo Wave", d: "524 new units = ~800 potential clients in your catchment by 2028.", a: ["Partner with condo buildings for move-in packages", "Create 'New to the Neighborhood' first-visit offer", "Build social presence showcasing local roots"] },
    { p: "OPPORTUNITY", c: C.green, bg: C.greenDim, t: "Weekend Morning Gap", d: "Foot traffic spikes 10-11 AM weekends. The 9-10 AM window is underserved.", a: ["Open Saturdays at 9:30 AM", "Early Bird pricing for first 3 appointments", "Target parents on Kingston Rd corridor"] },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif", maxWidth: 520, margin: "0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}textarea:focus,input:focus{outline:none}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
      `}</style>

      {/* Header */}
      <header style={{ padding: "14px 16px 12px", background: `linear-gradient(180deg,${C.surface},${C.bg})`, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 500 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `linear-gradient(135deg,${C.gold},${C.goldBr})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, boxShadow: `0 0 14px ${C.goldDim}` }}>📡</div>
            <div>
              <h1 style={{ fontSize: 17, fontWeight: 900, background: `linear-gradient(135deg,${C.goldBr},#f5e6b8)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>TurfWatch</h1>
              <p style={{ fontSize: 8, color: C.dim, letterSpacing: 2, textTransform: "uppercase" }}>{SHOP.name} · {SHOP.address}</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {connectionStatus === "connected" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}`, animation: "pulse 3s ease-in-out infinite" }} />}
            <div style={{ background: C.card, borderRadius: 8, padding: "5px 10px", border: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: threatScore > 70 ? C.red : threatScore > 40 ? C.orange : C.green }}>{threatScore}</div>
              <div style={{ fontSize: 6, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase" }}>THREAT</div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", background: C.surface, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 68, zIndex: 499, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, minWidth: 60, padding: "10px 0", fontSize: 9, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? C.goldBr : C.muted, background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${C.gold}` : "2px solid transparent",
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}>{t.icon}<br/>{t.l}</button>
        ))}
      </nav>

      <main style={{ padding: "16px 14px 100px" }}>

        {/* ═══ DASHBOARD ═══ */}
        {tab === "dashboard" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            {/* Data source indicator */}
            <div style={{
              padding: "6px 10px", borderRadius: 6, marginBottom: 12, fontSize: 10, display: "flex", alignItems: "center", gap: 6,
              background: isLiveData ? C.greenDim : C.goldDim,
              color: isLiveData ? C.green : C.gold,
              border: `1px solid ${isLiveData ? C.green : C.gold}25`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isLiveData ? C.green : C.gold, display: "inline-block" }} />
              {isLiveData ? `Live data · ${activeCompetitors.length} competitors discovered · Last scan: ${lastScan || "just now"}` : "Demo data · Go to Map tab → Scan Area to load live competitors"}
            </div>

            {/* Threat Gauge */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 14px 14px", marginBottom: 14, textAlign: "center" }}>
              <svg width="170" height="95" viewBox="0 0 170 95">
                <path d="M 10 85 A 75 75 0 0 1 160 85" fill="none" stroke={C.border} strokeWidth="8" strokeLinecap="round" />
                <path d="M 10 85 A 75 75 0 0 1 160 85" fill="none" stroke={threatScore > 70 ? C.red : threatScore > 40 ? C.orange : C.green} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${Math.PI * 75}`} strokeDashoffset={`${Math.PI * 75 * (1 - threatScore / 100)}`}
                  style={{ transition: "all 1.5s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 6px ${threatScore > 70 ? C.red : C.green}40)` }} />
                <text x="85" y="73" textAnchor="middle" fill={threatScore > 70 ? C.red : threatScore > 40 ? C.orange : C.green} fontSize="32" fontWeight="900" fontFamily="'IBM Plex Mono'">{threatScore}</text>
                <text x="85" y="89" textAnchor="middle" fill={C.dim} fontSize="7" letterSpacing="2">COMPETITIVE THREAT INDEX</text>
              </svg>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8, fontSize: 10, color: C.muted }}>
                <span><strong style={{ color: C.text }}>{activeCompetitors.length}</strong> competitors</span>
                <span><strong style={{ color: C.red }}>{activeCompetitors.filter(c => c.threat === "high").length}</strong> high threat</span>
                <span><strong style={{ color: C.text }}>{reports.length + 3}</strong> intel reports</span>
              </div>
            </div>

            {/* Demographics */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
              {[
                { l: "Population", v: "18,420", ch: "+6.2%", g: true },
                { l: "Median Income", v: "$82.5K", ch: "+14.3%", g: true },
                { l: "Median Age", v: "36.4", ch: "−2.1 yrs", g: true },
                { l: "Competitors <1km", v: String(activeCompetitors.filter(c => c.dist <= 1).length), ch: `+${activeCompetitors.filter(c => c.dist <= 1 && c.opened?.includes("202")).length} new`, g: false },
              ].map((s, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
                  <div style={{ fontSize: 7, color: C.dim, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>{s.l}</div>
                  <div style={{ fontSize: 19, fontWeight: 900, fontFamily: "'IBM Plex Mono'" }}>{s.v}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.g ? C.green : C.red, marginTop: 2 }}>{s.ch}</div>
                </div>
              ))}
            </div>

            {/* Rating Trends / Live Ratings */}
            <div style={{ marginBottom: 14 }}>
              {isLiveData ? (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12, fontWeight: 700 }}>Live Ratings · Google Reviews</div>
                  {/* Your shop */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.goldDim, borderRadius: 8, marginBottom: 8, border: `1px solid ${C.gold}20` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.goldBr }}>✂️ {SHOP.name}</div>
                      <div style={{ fontSize: 9, color: C.muted }}>{ownReviews.length} reviews analyzed</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Stars rating={shopAvgRating} size={11} />
                    </div>
                  </div>
                  {/* Competitor ratings */}
                  {activeCompetitors.filter(c => c.rating > 0).sort((a, b) => b.rating - a.rating).map((c, i) => {
                    const col = c.threat === "high" ? C.red : c.threat === "medium" ? C.orange : C.green;
                    return (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: `1px solid ${C.border}`, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: col, display: "inline-block" }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{c.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Stars rating={c.rating} size={9} />
                          <span style={{ fontSize: 9, color: C.dim }}>{c.reviews} rev</span>
                        </div>
                      </div>
                    );
                  })}
                  {shopAvgRating >= Math.max(...activeCompetitors.map(c => c.rating || 0)) && (
                    <div style={{ marginTop: 10, padding: "6px 10px", background: C.greenDim, borderRadius: 6, fontSize: 10, color: C.green }}>
                      ✓ You have the highest rating on the corridor
                    </div>
                  )}
                  {shopAvgRating < Math.max(...activeCompetitors.map(c => c.rating || 0)) && (
                    <div style={{ marginTop: 10, padding: "6px 10px", background: C.orangeDim, borderRadius: 6, fontSize: 10, color: C.orange }}>
                      ⚠ {activeCompetitors.filter(c => c.rating > shopAvgRating).length} competitor(s) rated higher than you — check Reviews tab for insights
                    </div>
                  )}
                </div>
              ) : (
                <RatingChart data={MOCK_RATING_TRENDS} />
              )}
            </div>

            {/* Developments */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Incoming Developments</div>
              {DEVELOPMENTS.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 4, animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
                  <div><div style={{ fontSize: 11, fontWeight: 700 }}>{d.name}</div><div style={{ fontSize: 9, color: C.muted }}>{d.dist} · {d.completion}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 800, color: C.gold, fontFamily: "'IBM Plex Mono'" }}>{d.units}</div><div style={{ fontSize: 7, color: C.dim, letterSpacing: 1 }}>{d.status}</div></div>
                </div>
              ))}
            </div>

            {/* Strategies */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Strategic Recommendations</div>
              <div style={{ background: `linear-gradient(135deg,${C.goldDim},${C.card})`, border: `1px solid ${C.gold}20`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[{ t: "Diagnosis", d: `${activeCompetitors.filter(c => c.threat === "high").length} high-threat competitors in 6 months targeting incoming young professionals.` }, { t: "Guiding Policy", d: "Leverage established reputation to lock in loyalty before new residents form habits." }, { t: "Coherent Action", d: "Loyalty + premium services + extended hours + condo partnerships." }].map((k, i) => (
                    <div key={i}><div style={{ fontSize: 7, color: C.gold, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 800, marginBottom: 4 }}>{k.t}</div><div style={{ fontSize: 9, color: C.muted, lineHeight: 1.5 }}>{k.d}</div></div>
                  ))}
                </div>
              </div>
              {STRATEGIES.map((s, i) => (
                <div key={i} onClick={() => setExpandedStrategy(expandedStrategy === i ? null : i)} style={{ background: C.card, border: `1px solid ${expandedStrategy === i ? s.c + "35" : C.border}`, borderRadius: 8, marginBottom: 6, cursor: "pointer", overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge text={s.p} color={s.c} bg={s.bg} />
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>{s.t}</span>
                    <span style={{ fontSize: 10, color: C.dim, transform: expandedStrategy === i ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
                  </div>
                  {expandedStrategy === i && (
                    <div style={{ padding: "0 12px 12px", animation: "fadeUp 0.2s ease" }}>
                      <p style={{ fontSize: 10, color: C.muted, lineHeight: 1.55, marginBottom: 8 }}>{s.d}</p>
                      {s.a.map((a, j) => <div key={j} style={{ display: "flex", gap: 6, marginBottom: 4 }}><span style={{ color: s.c, fontSize: 10 }}>→</span><span style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{a}</span></div>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ REVIEWS ═══ */}
        {tab === "reviews" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Reviews Intelligence</div>
              <button onClick={handleReviewScan} disabled={isAnalyzingReviews} style={{
                padding: "6px 14px", fontSize: 10, fontWeight: 700, background: isAnalyzingReviews ? C.dim : C.gold,
                color: isAnalyzingReviews ? C.muted : C.bg, border: "none", borderRadius: 6, cursor: isAnalyzingReviews ? "default" : "pointer", fontFamily: "inherit",
              }}>{isAnalyzingReviews ? "Analyzing..." : "🔄 Analyze Reviews"}</button>
            </div>

            {isAnalyzingReviews && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, textAlign: "center", marginBottom: 14 }}>
                <Spinner /><div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>{scanStatus || "Analyzing reviews..."}</div>
              </div>
            )}

            {!isAnalyzingReviews && scanStatus && scanStatus.includes("complete") && (
              <div style={{ fontSize: 10, color: C.green, background: C.greenDim, borderRadius: 6, padding: "6px 10px", marginBottom: 12, border: `1px solid ${C.green}25` }}>
                ✓ {scanStatus}{lastScan ? ` · ${lastScan}` : ""}
              </div>
            )}

            {/* Your Reviews */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{SHOP.name}</div>
                <Stars rating={shopAvgRating} size={11} />
                <span style={{ fontSize: 9, color: C.muted }}>({ownReviews.length} recent)</span>
              </div>

              {ownAnalysis && (
                <div style={{ background: C.goldDim, border: `1px solid ${C.gold}20`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 8, color: C.gold, fontWeight: 800, letterSpacing: 1.5, marginBottom: 6 }}>AI REVIEW ANALYSIS</div>
                  <p style={{ fontSize: 11, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>{ownAnalysis.summary}</p>
                  {ownAnalysis.themes && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                      {ownAnalysis.themes.map((t, i) => (
                        <span key={i} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, fontWeight: 600, color: t.sentiment === "positive" ? C.green : t.sentiment === "negative" ? C.red : C.muted, background: t.sentiment === "positive" ? C.greenDim : t.sentiment === "negative" ? C.redDim : C.border }}>{t.theme} ({t.count})</span>
                      ))}
                    </div>
                  )}
                  {ownAnalysis.actionItems && (
                    <div>{ownAnalysis.actionItems.map((a, i) => <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}><span style={{ color: C.gold, fontSize: 10 }}>→</span><span style={{ fontSize: 10, color: C.text, lineHeight: 1.5 }}>{a}</span></div>)}</div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ownReviews.slice(0, 4).map((r, i) => <ReviewCard key={i} review={r} compact />)}
              </div>
            </div>

            {/* Competitor Reviews */}
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Competitor Reviews</div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
              {activeCompetitors.filter(c => c.threat !== "low").map(c => (
                <button key={c.id} onClick={() => setSelectedComp(selectedComp === c.id ? null : c.id)} style={{
                  padding: "6px 12px", fontSize: 10, fontWeight: selectedComp === c.id ? 700 : 500, whiteSpace: "nowrap",
                  background: selectedComp === c.id ? C.gold : C.card, color: selectedComp === c.id ? C.bg : C.muted,
                  border: `1px solid ${selectedComp === c.id ? C.gold : C.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                }}>{c.name} ★{c.rating}</button>
              ))}
            </div>

            {selectedComp && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {compAnalyses[selectedComp] && (
                  <div style={{ background: C.redDim, border: `1px solid ${C.red}20`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 8, color: C.red, fontWeight: 800, letterSpacing: 1.5, marginBottom: 6 }}>COMPETITOR INTELLIGENCE</div>
                    <p style={{ fontSize: 11, color: C.text, lineHeight: 1.6, marginBottom: 8 }}>{compAnalyses[selectedComp].summary}</p>
                    {compAnalyses[selectedComp].exploitableGaps && (
                      <div>
                        <div style={{ fontSize: 9, color: C.orange, fontWeight: 700, marginBottom: 4 }}>EXPLOITABLE GAPS:</div>
                        {compAnalyses[selectedComp].exploitableGaps.map((g, i) => <div key={i} style={{ fontSize: 10, color: C.text, lineHeight: 1.5, marginBottom: 3 }}>• {g}</div>)}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(competitorReviews[selectedComp] || []).map((r, i) => <ReviewCard key={i} review={r} compact />)}
                  {!(competitorReviews[selectedComp]?.length) && <div style={{ fontSize: 11, color: C.dim, padding: 12, textAlign: "center" }}>No reviews loaded. {apiKey ? "Hit refresh to fetch." : "Add API key in Settings for live data."}</div>}
                </div>
              </div>
            )}

            {!selectedComp && !isAnalyzingReviews && (
              <div style={{ padding: 20, textAlign: "center", color: C.dim, fontSize: 11 }}>
                Select a competitor above to view their reviews and AI analysis
              </div>
            )}
          </div>
        )}

        {/* ═══ MAP ═══ */}
        {tab === "map" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Competitor Map</div>
              <button onClick={handleScan} disabled={isScanning} style={{
                padding: "6px 14px", fontSize: 10, fontWeight: 700, background: isScanning ? C.dim : C.gold,
                color: isScanning ? C.muted : C.bg, border: "none", borderRadius: 6, cursor: isScanning ? "default" : "pointer", fontFamily: "inherit",
              }}>{isScanning ? "Scanning..." : "🔄 Scan Area"}</button>
            </div>

            {isScanning && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, textAlign: "center", marginBottom: 12 }}>
                <Spinner /><div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{scanStatus}</div>
              </div>
            )}

            {scanStatus && !isScanning && (
              <div style={{ fontSize: 10, color: C.muted, background: C.card, borderRadius: 6, padding: "6px 10px", marginBottom: 10, border: `1px solid ${C.border}` }}>
                {scanStatus}{lastScan && <span style={{ color: C.dim }}> · Last scan: {lastScan}</span>}
              </div>
            )}

            <CompetitorMapLeaflet competitors={competitors} shop={SHOP} />

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {activeCompetitors.map((c, i) => (
                <div key={c.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", animation: `fadeUp 0.3s ease ${i * 40}ms both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</span>
                    <Badge text={c.threat} color={c.threat === "high" ? C.red : c.threat === "medium" ? C.orange : C.green} bg={c.threat === "high" ? C.redDim : c.threat === "medium" ? C.orangeDim : C.greenDim} />
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{c.services}</div>
                  <div style={{ display: "flex", gap: 10, fontSize: 9, color: C.dim }}>
                    <span>{c.dist} km</span><span>{c.price}</span><Stars rating={c.rating} size={8} /><span>{c.reviews} reviews</span>
                  </div>
                  {c.aiReason && <div style={{ fontSize: 9, color: C.muted, marginTop: 6, padding: "4px 8px", background: C.surface, borderRadius: 4, fontStyle: "italic" }}>AI: {c.aiReason}</div>}
                </div>
              ))}

              {/* Non-competitors */}
              {competitors.filter(c => !c.isCompetitor).length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Nearby — Not Competitors</div>
                  {competitors.filter(c => !c.isCompetitor).map((c, i) => (
                    <div key={c.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", marginBottom: 4, opacity: 0.6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <span style={{ color: C.muted }}>{c.name}</span>
                        <span style={{ fontSize: 9, color: C.dim }}>{c.services}</span>
                      </div>
                      {c.aiReason && <div style={{ fontSize: 8, color: C.dim, marginTop: 2, fontStyle: "italic" }}>{c.aiReason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ REPORT ═══ */}
        {tab === "report" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Field Report</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>Type what you see — new shops, different crowds, client requests. AI analyzes against all data.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => { setReportText(p.starter); textRef.current?.focus(); }} style={{
                  padding: "5px 9px", fontSize: 9, background: C.card, color: C.muted,
                  border: `1px solid ${C.border}`, borderRadius: 14, cursor: "pointer", fontFamily: "inherit",
                }}>{p.icon} {p.label}</button>
              ))}
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.borderHi}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
              <textarea ref={textRef} value={reportText} onChange={e => setReportText(e.target.value)} placeholder="e.g. New barber shop sign on Kingston..." rows={3}
                style={{ width: "100%", background: "transparent", color: C.text, border: "none", fontSize: 12, lineHeight: 1.6, padding: "12px 12px 6px", resize: "none", fontFamily: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 8, color: C.dim }}>{reportText.length || "0"} chars</span>
                <button onClick={handleReport} disabled={!reportText.trim() || isAnalyzingReport} style={{
                  padding: "6px 16px", fontSize: 10, fontWeight: 700,
                  background: reportText.trim() && !isAnalyzingReport ? C.gold : C.dim,
                  color: reportText.trim() && !isAnalyzingReport ? C.bg : C.muted,
                  border: "none", borderRadius: 6, cursor: reportText.trim() ? "pointer" : "default", fontFamily: "inherit",
                }}>{isAnalyzingReport ? "..." : "Analyze →"}</button>
              </div>
            </div>

            {isAnalyzingReport && <div style={{ textAlign: "center", padding: 16 }}><Spinner /><div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Analyzing...</div></div>}

            {reportResult && !reportResult.error && !isAnalyzingReport && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <ReportCardInline report={reportResult} />
                <div style={{ marginTop: 8, padding: "6px 10px", background: C.greenDim, borderRadius: 6, fontSize: 9, color: C.green, textAlign: "center" }}>✓ Added to feed</div>
              </div>
            )}

            {/* Recent reports */}
            {reports.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Recent Reports</div>
                {reports.slice(0, 5).map((r, i) => <ReportCardInline key={r.id} report={r} style={{ marginBottom: 8 }} />)}
              </div>
            )}
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === "settings" && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 14 }}>Settings</div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Outscraper API Key</div>
              <p style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
                Add your API key to enable live Google Reviews feeds and auto-discovery of competitors. Without a key, TurfWatch uses demo data.
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="password" value={apiKey} onChange={e => { saveApiKey(e.target.value); setConnectionStatus(null); }}
                  placeholder="Paste your Outscraper API key"
                  style={{ flex: 1, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 6, padding: "8px 12px", color: C.text, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}
                />
                <button onClick={async () => {
                  if (!apiKey) return;
                  setLiveMode(true);
                  setConnectionStatus("connecting");
                  try {
                    // Validate key with backend proxy
                    setScanStatus("Validating API key...");
                    await apiValidate(apiKey);
                    setConnectionStatus("connected");
                    setScanStatus("API key valid! Running full scan...");
                    // Auto-trigger full pipeline
                    const freshCompetitors = await handleScan();
                    await handleReviewScan(freshCompetitors);
                  } catch (e) {
                    console.error("API key validation failed:", e);
                    setConnectionStatus("error");
                    setScanStatus("API key invalid or request failed. Check your key and try again.");
                    setLiveMode(false);
                  }
                }} disabled={!apiKey || connectionStatus === "connecting"} style={{
                  padding: "8px 14px", fontSize: 10, fontWeight: 700,
                  background: connectionStatus === "connected" ? C.green : connectionStatus === "error" ? C.red : apiKey ? C.gold : C.dim,
                  color: connectionStatus === "connected" || connectionStatus === "error" ? "#fff" : apiKey ? C.bg : C.muted,
                  border: "none", borderRadius: 6, cursor: apiKey ? "pointer" : "default", fontFamily: "inherit",
                  minWidth: 90,
                }}>{connectionStatus === "connecting" ? "Testing..." : connectionStatus === "connected" ? "✓ Live" : connectionStatus === "error" ? "✗ Failed" : apiKey ? "Connect →" : "No Key"}</button>
              </div>
              {connectionStatus === "connected" && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: C.greenDim, borderRadius: 6, fontSize: 10, color: C.green, border: `1px solid ${C.green}25` }}>
                  ✓ Connected to Outscraper. Competitors and reviews have been refreshed with live data.
                </div>
              )}
              {connectionStatus === "error" && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: C.redDim, borderRadius: 6, fontSize: 10, color: C.red, border: `1px solid ${C.red}25` }}>
                  Connection failed. Check your API key and try again. If the problem persists, the backend server may be waking up — wait 10 seconds and retry.
                </div>
              )}
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Data Mode</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${connectionStatus === "connected" ? C.border : C.gold}`, background: connectionStatus === "connected" ? C.surface : C.goldDim, textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>🎭</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: connectionStatus === "connected" ? C.muted : C.gold }}>Demo Data</div>
                  <div style={{ fontSize: 8, color: C.dim, marginTop: 2 }}>Realistic simulation</div>
                </div>
                <div style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${connectionStatus === "connected" ? C.green : C.border}`, background: connectionStatus === "connected" ? C.greenDim : C.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{connectionStatus === "connected" ? "🟢" : "🔴"}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: connectionStatus === "connected" ? C.green : C.muted }}>Live API</div>
                  <div style={{ fontSize: 8, color: C.dim, marginTop: 2 }}>{connectionStatus === "connected" ? "Active" : connectionStatus === "connecting" ? "Connecting..." : "Needs API key"}</div>
                </div>
              </div>
            </div>

            {/* Client Info */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10 }}>Your Business</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div><div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>Name</div><div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginTop: 2 }}>{SHOP.name}</div></div>
                <div><div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>Type</div><div style={{ fontSize: 12, color: C.text, marginTop: 2, textTransform: "capitalize" }}>{(SHOP.type || "barbershop").replace("_", " ")}</div></div>
                <div><div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>Address</div><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{SHOP.address}</div></div>
                <div><div style={{ fontSize: 8, color: C.dim, textTransform: "uppercase", letterSpacing: 1 }}>Scan Radius</div><div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>{((SHOP.radius || 1500) / 1000).toFixed(1)} km</div></div>
              </div>
              <div style={{ display: "flex", gap: 6, fontSize: 10, color: C.dim }}>
                <span>📍 {SHOP.lat?.toFixed(4)}, {SHOP.lng?.toFixed(4)}</span>
              </div>
              <button onClick={() => { localStorage.removeItem("turfwatch_client"); setClient(null); }} style={{
                marginTop: 12, width: "100%", padding: "8px 0", fontSize: 10, fontWeight: 600,
                background: "transparent", color: C.red, border: `1px solid ${C.red}30`,
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
              }}>Reset Business Setup</button>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>How It Works</div>
              {[
                { icon: "📍", t: "Auto-Discovery", d: `Outscraper searches Google Maps for competitors within ${((SHOP.radius || 1500) / 1000).toFixed(1)} km of your location. AI classifies each by service overlap.` },
                { icon: "⭐", t: "Review Intelligence", d: "Pulls latest Google reviews for your shop + all competitors. AI extracts sentiment, themes, service gaps, and switching patterns." },
                { icon: "📊", t: "Rating Trends", d: "Tracks star ratings across all monitored shops. Shows where you stand vs the competition." },
                { icon: "✏️", t: "Field Reports", d: "Type what you see on the ground. AI cross-references with all data to generate actionable intelligence." },
                { icon: "🔧", t: "Backend Proxy", d: "API calls route through a secure Express server on Railway for authentication and security." },
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>{s.icon}</span>
                  <div><div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>{s.t}</div><div style={{ fontSize: 10, color: C.muted, lineHeight: 1.55 }}>{s.d}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ReportCardInline({ report, style: s }) {
  const a = report.ai;
  const col = { high: C.red, medium: C.orange, low: C.green, opportunity: C.blue }[a.threat] || C.muted;
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", ...s }}>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: C.muted, fontFamily: "'IBM Plex Mono'" }}>{report.date} · {report.time}</span>
          <div style={{ display: "flex", gap: 4 }}>
            <Badge text={a.cat} color={C.gold} bg={C.goldDim} />
            <Badge text={a.threat} color={col} bg={col === C.red ? C.redDim : col === C.orange ? C.orangeDim : col === C.blue ? C.blueDim : C.greenDim} />
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.55, borderLeft: `2px solid ${C.dim}`, paddingLeft: 10, fontStyle: "italic", opacity: 0.85 }}>"{report.text}"</div>
      </div>
      <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: "10px 12px" }}>
        <div style={{ fontSize: 7, color: C.gold, textTransform: "uppercase", letterSpacing: 2, fontWeight: 800, marginBottom: 6 }}>AI Analysis</div>
        {a.insights.map((ins, j) => <div key={j} style={{ display: "flex", gap: 6, marginBottom: 3 }}><span style={{ color: C.gold, fontSize: 9 }}>▸</span><span style={{ fontSize: 10, color: C.text, lineHeight: 1.5, opacity: 0.85 }}>{ins}</span></div>)}
        <div style={{ marginTop: 8, background: C.goldDim, border: `1px solid ${C.gold}18`, borderRadius: 6, padding: 8 }}>
          <div style={{ fontSize: 7, fontWeight: 800, color: C.gold, letterSpacing: 1.5, marginBottom: 2 }}>➜ ACTION</div>
          <div style={{ fontSize: 10, color: C.text, lineHeight: 1.55 }}>{a.rec}</div>
        </div>
        <div style={{ marginTop: 6, fontSize: 9, color: C.muted }}>Threat impact: <span style={{ color: a.impact > 0 ? C.red : C.green, fontWeight: 700, fontFamily: "'IBM Plex Mono'" }}>{a.impact > 0 ? "+" : ""}{a.impact}</span></div>
      </div>
    </div>
  );
}

const DEVELOPMENTS = [
  { name: "Kingston & Midland Condos", units: 280, status: "Building", completion: "Q3 2026", dist: "0.4 km" },
  { name: "Birchcliff Urban Towns", units: 64, status: "Pre-Sale", completion: "Q1 2027", dist: "0.6 km" },
  { name: "The Cliffside Residences", units: 180, status: "Approved", completion: "2028", dist: "0.8 km" },
];

const QUICK_PROMPTS = [
  { icon: "🏪", label: "New shop", starter: "Spotted a new barbershop/salon — " },
  { icon: "👥", label: "Different crowd", starter: "The crowd today looks different — " },
  { icon: "📉", label: "Slow day", starter: "It's been quieter than usual. " },
  { icon: "💬", label: "Client ask", starter: "A client asked about " },
  { icon: "🚧", label: "Construction", starter: "There's construction on " },
];
