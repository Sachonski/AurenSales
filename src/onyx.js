// src/onyx.js
// Talks to the Onyx MCP server using your API key and runs the agent-status query.
// If Onyx isn't configured (or a call fails) the server falls back to the bundled
// snapshot so the dashboard always renders something for the team.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PROFILE_ID = 511; // "Inbound Home Health Agent"

// The exact query, validated against Onyx. Returns one row per active agent on the profile,
// ordered by longest time in current status first.
export const AGENTS_SQL = `SELECT u.id AS user_id, u.first_name || ' ' || u.last_name AS agent_name, COALESCE(string_agg(DISTINCT t.name, ', '), '') AS team_name, wp.name AS agent_profile, wq.work_type, wq.worker_type, wq.current_activity AS status, wq.current_activity_updated_at, wq.license_states, wq.crm_group_ids, CASE WHEN wpl.override_enabled THEN wpl.override_level ELSE wpl.calculated_level END AS agent_level, caps.call_cap_daily, caps.call_cap_hourly FROM workers_queue wq JOIN users u ON u.id = wq.user_id JOIN worker_profiles wp ON wp.id = wq.worker_profile_id LEFT JOIN team_members tm ON tm.user_id = u.id LEFT JOIN teams t ON t.id = tm.team_id LEFT JOIN worker_profile_levels wpl ON wpl.user_id = u.id AND wpl.worker_profile_id = wq.worker_profile_id LEFT JOIN user_worker_profile_rels upr ON upr.user_id = u.id AND upr.worker_profile_id = wq.worker_profile_id AND upr.status = 'ENABLED' LEFT JOIN user_worker_profile_call_caps caps ON caps.user_worker_profile_rel_id = upr.id AND caps.is_active = true WHERE wq.worker_profile_id = ${PROFILE_ID} AND wq.is_active_profile = true GROUP BY u.id, u.first_name, u.last_name, wp.name, wq.work_type, wq.worker_type, wq.current_activity, wq.current_activity_updated_at, wq.license_states, wq.crm_group_ids, wpl.override_enabled, wpl.override_level, wpl.calculated_level, caps.call_cap_daily, caps.call_cap_hourly ORDER BY wq.current_activity_updated_at ASC`;

const {
  ONYX_MCP_URL = "https://mcp.onyxplatform.com",
  ONYX_API_KEY = "",
  ONYX_AUTH_HEADER = "Authorization",          // header name your key goes in
  ONYX_AUTH_SCHEME = "Bearer",                  // prefix; set to "" if your key is raw
  ONYX_SQL_TOOL = "sql_execute_query"           // native MCP tool name on the server
} = process.env;

export const onyxConfigured = Boolean(ONYX_API_KEY);

function authHeaders() {
  const value = ONYX_AUTH_SCHEME ? `${ONYX_AUTH_SCHEME} ${ONYX_API_KEY}` : ONYX_API_KEY;
  return { [ONYX_AUTH_HEADER]: value };
}

// Runs the SQL via the Onyx MCP server and returns { columns, rows }.
export async function queryAgents() {
  if (!onyxConfigured) {
    throw new Error("Onyx not configured (set ONYX_API_KEY).");
  }
  const transport = new StreamableHTTPClientTransport(new URL(ONYX_MCP_URL), {
    requestInit: { headers: authHeaders() }
  });
  const client = new Client({ name: "ihha-dashboard", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    const res = await client.callTool({
      name: ONYX_SQL_TOOL,
      arguments: { params: { sql: AGENTS_SQL } }
    });
    const block = (res.content || []).find((c) => c.type === "text");
    if (!block?.text) throw new Error("Onyx returned no text result.");
    const parsed = JSON.parse(block.text);
    if (!parsed.columns || !parsed.rows) throw new Error("Unexpected Onyx result shape.");
    return parsed;
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}
