const https = require('https')

const BASE    = (process.env.ONYX_API_BASE_URL || 'https://api.onyxplatform.com').replace(/\/$/, '')
const KEY     = process.env.ONYX_API_KEY || ''
const TEAM_ID = process.env.ONYX_TEAM_ID || '74'

function get(path, query = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path)
    Object.entries(query).forEach(([k, v]) => {
      if (Array.isArray(v)) v.forEach(val => url.searchParams.append(k, val))
      else url.searchParams.set(k, v)
    })
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!KEY) return res.status(500).json({ error: 'ONYX_API_KEY env var is required' })

  try {
    const r = await get('/api/v1/supervisor/workers', {
      page: 1, page_size: 100,
      activities: ['ONLINE', 'RESERVED', 'DIRECT_INBOUND'],
      team_id: TEAM_ID,
    })

    if (r.status !== 200) {
      return res.status(502).json({ error: `Onyx API ${r.status}`, body: r.body })
    }

    const data = JSON.parse(r.body)
    const workers = data.results || data.workers || data || []

    const agents = workers.map(w => ({
      userId:          w.id || w.user_id,
      name:            w.friendly_name || w.name || `${w.first_name||''} ${w.last_name||''}`.trim(),
      activity:        w.activity_name || w.current_activity || w.activity,
      profileName:     w.worker_profile_name || w.profile_name || '—',
      secondsInStatus: w.time_in_current_activity != null
        ? w.time_in_current_activity
        : (w.activity_started_at ? Math.round((Date.now()-new Date(w.activity_started_at))/1000) : 0),
    }))
    .sort((a, b) => b.secondsInStatus - a.secondsInStatus)

    return res.status(200).json({ agents, sample: workers[0] || null })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}