// server.js
import "dotenv/config";
import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { queryAgents, debugSample, onyxConfigured } from "./src/onyx.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60000);

const app = express();
app.use(express.static(join(__dirname, "public")));

const roster = JSON.parse(await readFile(join(__dirname, "data", "roster.json"), "utf8"));
const emptyBuckets = () => ({ available_sec: 0, on_call_sec: 0, not_available_sec: 0, dispositioning_sec: 0, logged_out_sec: 0 });
const fallbackAgents = () =>
  Object.entries(roster).map(([uid, r]) => ({ user_id: Number(uid), ...r, ...emptyBuckets(), active_today: false }));

let cache = { at: 0, payload: null };

app.get("/api/agents", async (req, res) => {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_TTL_MS) {
    return res.json({ ...cache.payload, cached: true });
  }
  try {
    const { agents } = await queryAgents();
    const payload = { source: "live", captured_at: new Date().toISOString(), agents };
    cache = { at: now, payload };
    res.json(payload);
  } catch (err) {
    res.json({
      source: "error",
      error: onyxConfigured ? String(err.message || err) : "Onyx not configured (set ONYX_API_KEY and ONYX_ORG).",
      captured_at: new Date().toISOString(),
      agents: fallbackAgents()
    });
  }
});

app.get("/api/debug", async (req, res) => {
  try { res.json(await debugSample()); }
  catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.get("/api/health", (req, res) => res.json({ ok: true, onyx_configured: onyxConfigured }));

app.listen(PORT, () => {
  console.log(`IHHA Daily Activity on http://localhost:${PORT}`);
  console.log(`Onyx live data: ${onyxConfigured ? "ENABLED" : "DISABLED"}`);
});
