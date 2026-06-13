const https = require('https')

const BASE = (process.env.ONYX_API_BASE_URL || '').replace(/\/$/, '')
const KEY  = process.env.ONYX_API_KEY || ''

function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!BASE || !KEY) return res.status(500).json({ error: 'Missing env vars' })

  const PATHS = [
    '/external/v1/user-activities/current',
    '/api/external/v1/user-activities/current',
    '/external/user-activities/current',
    '/api/v1/user-activities/current',
  ]

  try {
    let workingPath = null
    let actData = null
    for (const path of PATHS) {
      const r = await get(path)
      if (r.status === 200) {
        workingPath = path
        actData = JSON.parse(r.body)
        break
      }
    }

    if (!workingPath) {
      return res.status(502).json({ error: 'No working path found', tried: PATHS, base: BASE })
    }

    const rows = actData.users || actData.results || (Array.isArray(actData) ? actData : [])
    const available = rows
      .filter(u => ['Online', 'Direct Inbound'].includes(u.activity))
      .map(u => ({
        userId: u.id || u.user_id,
        name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        activity: u.activity,
        profileName: u.worker_profile || u.agent_profile || u.profile || '—',
        secondsInStatus: u.started_at
          ? Math.round((Date.now() - new Date(u.started_at).getTime()) / 1000) : 0,
      }))
      .sort((a, b) => b.secondsInStatus - a.secondsInStatus)

    return res.status(200).json({ agents: available, path: workingPath })
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack })
  }
}