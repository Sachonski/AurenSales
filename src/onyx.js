// src/onyx.js
// Pulls live agent status from the Onyx REST API (External User Activities)
// and merges it onto the static roster of Inbound Home Health Agents.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  ONYX_API_KEY = "",
  ONYX_API_BASE = "https://api.onyxplatform.com",
  ONYX_ORG = "",                       // organization_name slug, e.g. "auren-health"
  ONYX_AUTH_HEADER = "Authorization",
  ONYX_AUTH_SCHEME = "Bearer"
} = process.env;

export const onyxConfigured = Boolean(ONYX_API_KEY && ONYX_ORG);

// Static attributes for the 22 IHHA agents, keyed by Onyx user_id.
const roster = JSON.parse(await readFile(join(__dirname, "..", "data", "roster.json"), "utf8"));

function authHeaders() {
  const value = ONYX_AUTH_SCHEME ? `${ONYX_AUTH_SCHEME} ${ONYX_API_KEY}` : ONYX_API_KEY;
  return { [ONYX_AUTH_HEADER]: value, Accept: "application/json" };
}

// Normalize whatever the API returns into the display labels the UI expects.
function normalizeStatus(s) {
  if (!s) return "Logged Out";
  const k = String(s).trim().toLowerCase().replace(/[_\s]+/g, "_");
  const map = {
    online: "Online", available: "Online",
    offline: "Offline", not_available: "Offline",
    on_call: "On Call", oncall: "On Call",
    reserved: "Reserved",
    dispositioning: "Dispositioning",
    direct_inbound: "Direct Inbound",
    logged_out: "Logged Out", loggedout: "Logged Out"
  };
  return map[k] || String(s);
}

// Try several likely field names so we're resilient to the exact schema.
const pick = (o, keys) => { for (const k of keys) if (o?.[k] != null) return o[k]; return null; };

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.items || payload?.data || payload?.results || payload?.activities || [];
}

// Fetch current activity for every user in the org (handles simple pagination).
async function fetchActivities() {
  const base = `${ONYX_API_BASE}/api/external/v1/user-activities/${encodeURIComponent(ONYX_ORG)}`;
  const out = [];
  let page = 1;
  for (let i = 0; i < 50; i++) {            // hard cap on pages
    const url = `${base}?page=${page}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} from Onyx${body ? " — " + body.slice(0, 200) : ""}`);
    }
    const payload = await res.json();
    const list = extractList(payload);
    out.push(...list);
    const hasMore = payload?.has_more || payload?.next_page || (payload?.total_pages && page < payload.total_pages);
    if (!list.length || !hasMore) break;
    page += 1;
  }
  return out;
}

// Returns { columns, rows } in the same shape the UI already consumes.
export async function queryAgents() {
  if (!onyxConfigured) throw new Error("Onyx not configured (set ONYX_API_KEY and ONYX_ORG).");

  const activities = await fetchActivities();

  // Index live activity by user_id.
  const live = {};
  for (const a of activities) {
    const uid = pick(a, ["user_id", "userId", "id", "user"]);
    if (uid == null) continue;
    live[String(uid)] = {
      status: normalizeStatus(pick(a, ["activity", "current_activity", "status", "state"])),
      started_at: pick(a, ["started_at", "activity_started_at", "current_activity_updated_at", "since", "updated_at"])
    };
  }

  const columns = ["user_id","agent_name","team_name","agent_profile","work_type","worker_type",
                   "status","current_activity_updated_at","license_states","crm_group_ids",
                   "agent_level","call_cap_daily","call_cap_hourly"].map((name) => ({ name }));

  const rows = Object.entries(roster).map(([uid, r]) => {
    const l = live[uid] || { status: "Logged Out", started_at: null };
    return [
      Number(uid), r.agent_name, r.team_name, r.agent_profile, r.work_type, r.worker_type,
      l.status, l.started_at, r.license_states, r.crm_group_ids,
      r.agent_level, r.call_cap_daily, r.call_cap_hourly
    ];
  });

  return { columns, rows, _live_count: activities.length };
}

// Expose a raw sample for debugging the response shape on first run.
export async function debugSample() {
  if (!onyxConfigured) return { configured: false };
  const list = await fetchActivities();
  return { configured: true, count: list.length, sample: list.slice(0, 2) };
}
