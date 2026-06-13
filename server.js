import "dotenv/config";
// server.js
import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { queryAgents, onyxConfigured } from "./src/onyx.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10000); // serve cached data for N ms

const app = express();
app.use(express.static(join(__dirname, "public")));

// Load the bundled snapshot once so we always have something to show.
const snapshot = JSON.parse(await readFile(join(__dirname, "data", "snapshot.json"), "utf8"));

let cache = { at: 0, payload: null };

app.get("/api/agents", async (req, res) => {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_TTL_MS) {
    return res.json(cache.payload);
  }
  try {
    const data = await queryAgents();
    const payload = {
      source: "live",
      captured_at: new Date().toISOString(),
      columns: data.columns,
      rows: data.rows
    };
    cache = { at: now, payload };
    res.json(payload);
  } catch (err) {
    // Fall back to the snapshot so the team never sees a broken page.
    const payload = {
      source: onyxConfigured ? "snapshot_after_error" : "snapshot",
      error: onyxConfigured ? String(err.message || err) : "Onyx not configured (set ONYX_API_KEY).",
      captured_at: snapshot.captured_at,
      columns: snapshot.columns,
      rows: snapshot.rows
    };
    res.json(payload);
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, onyx_configured: onyxConfigured });
});

app.listen(PORT, () => {
  console.log(`IHHA Real Time Ops running on http://localhost:${PORT}`);
  console.log(`Onyx live data: ${onyxConfigured ? "ENABLED" : "DISABLED (snapshot mode)"}`);
});

