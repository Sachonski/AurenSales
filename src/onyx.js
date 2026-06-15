// src/onyx.js
// Pulls each agent's CURRENT activity + when it started from the Onyx REST API,
// then merges it onto the static IHHA roster.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  ONYX_API_KEY = "",
  ONYX_API_BASE = "https://api.onyxplatform.com",
  ONYX_ORG = "",
  ONYX_AUTH_HEADER = "X-API-Key",
  ONYX_AUTH_SCHEME = ""
} = process.env;

export const onyxConfigured = Boolean(ONYX_API_KEY && ONYX_ORG);

const roster = JSON.parse(await readFile(join(__dirname, "..", "data", "roster.json"), "utf8"));
const ROSTER_IDS = new Set(Object.keys(roster).map(Number));

// raw activity -> display status
function normalizeStatus(s) {
  const map = {
    ONLINE: "Available", RESERVED: "Available", DIRECT_INBOUND: "Available", AVAILABLE: "Available",
    ON_CALL: "On Call",
    OFFLINE: "Not Available", NOT_AVAILABLE: "Not Available",
    DISPOSITIONING: "Dispositioning",
    LOGGED_OUT: "Logged Out"
  };
  return map[String(s || "").toUpperCase()] || "Logged Out";
}

function authHeaders() {
  const value = ONYX_AUTH_SCHEME ? `${ONYX_AUTH_SCHEME} ${ONYX_API_KEY}` : ONYX_API_KEY;
  return { [ONYX_AUTH_HEADER]: value, Accept: "application/json" };
}

async function fetchActivities() {
  const base = `${ONYX_API_BASE}/api/external/v1/user-activities/${encodeURIComponent(ONYX_ORG)}`;
  const out = [];
  let page = 1;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(`${base}?page=${page}`, { headers: authHeaders() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from Onyx${body ? " — " + body.slice(0, 200) : ""}`);
    }
    const payload = await res.json();
    const list = payload?.items || (Array.isArray(payload) ? payload : []);
    out.push(...list);
    if (!payload?.has_next) break;
    page += 1;
  }
  return out;
}

export async function queryAgents() {
  if (!onyxConfigured) throw new Error("Onyx not configured (set ONYX_API_KEY and ONYX_ORG).");
  const items = await fetchActivities();

  // Current activity per roster user. If a user appears more than once, keep the most recent start.
  const live = {};
  for (const it of items) {
    const uid = it.user_id;
    if (!ROSTER_IDS.has(uid)) continue;            // only the IHHA agents
    const start = it.start_time_utc || it.started_at || null;
    const prev = live[uid];
    if (!prev || (start && prev.start && new Date(start) > new Date(prev.start))) {
      live[uid] = {
        status: normalizeStatus(it.current_activity || it.activity),
        start,
        custom: it.current_custom_activity || it.custom_activity || null
      };
    }
  }

  const rows = Object.entries(roster).map(([uid, r]) => {
    const l = live[uid] || { status: "Logged Out", start: null, custom: null };
    return {
      user_id: Number(uid), ...r,
      status: l.status,
      start_time_utc: l.start,
      custom_activity: l.custom
    };
  });

  return { agents: rows };
}

export async function debugSample() {
  if (!onyxConfigured) return { configured: false };
  const list = await fetchActivities();
  return { configured: true, count: list.length, sample: list.slice(0, 3) };
}
