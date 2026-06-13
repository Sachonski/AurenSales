const MCP_URL = (process.env.ONYX_MCP_URL || 'https://mcp.onyxplatform.com').replace(/\/$/, '')
const KEY = process.env.ONYX_API_KEY || ''

const TEAM_ID = process.env.ONYX_TEAM_ID || '74'

const SQL = `
  SELECT
    w.user_id,
    w.name,
    w.current_activity,
    w.current_activity_updated_at,
    wp.name AS profile_name
  FROM workers_queue w
  LEFT JOIN worker_profiles wp ON wp.id = w.worker_profile_id
  WHERE w.team_id = ${TEAM_ID}
    AND w.current_activity IN ('ONLINE', 'DIRECT_INBOUND')
  ORDER BY w.current_activity_updated_at ASC
  LIMIT 100
`

async function queryMCP(sql) {
  const res = await fetch(`${MCP_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'sql_execute_query',
        arguments: { params: { sql } },
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MCP HTTP ${res.status}: ${text}`)
  }
  const json = await res.json()
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`)
  const content = json.result?.content?.[0]?.text
  if (!content) throw new Error('Empty MCP response')
  return JSON.parse(content)
}

const ACTIVITY_LABEL = {
  ONLINE: 'Online',
  DIRECT_INBOUND: 'Direct Inbound',
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!KEY) {
    return res.status(500).json({ error: 'ONYX_API_KEY env var is required' })
  }

  try {
    const data = await queryMCP(SQL)
    const rows = data.rows || []
    const cols = (data.columns || []).map(c => c.name)

    const agents = rows.map(row => {
      const r = {}
      cols.forEach((c, i) => { r[c] = row[i] })
      const startedAt = r.current_activity_updated_at
        ? new Date(r.current_activity_updated_at + 'Z')
        : null
      const secondsInStatus = startedAt
        ? Math.round((Date.now() - startedAt.getTime()) / 1000)
        : 0
      return {
        userId:          r.user_id,
        name:            r.name || '—',
        activity:        ACTIVITY_LABEL[r.current_activity] || r.current_activity,
        profileName:     r.profile_name || '—',
        secondsInStatus,
      }
    })

    agents.sort((a, b) => b.secondsInStatus - a.secondsInStatus)

    return res.status(200).json({ agents })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}