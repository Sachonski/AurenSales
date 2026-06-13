const BASE = (process.env.ONYX_API_BASE_URL || '').replace(/\/$/, '')
const KEY  = process.env.ONYX_API_KEY || ''

const ACTIVITY_PATHS = [
  '/external/v1/user-activities/current',
  '/api/external/v1/user-activities/current',
  '/v1/external/user-activities/current',
  '/external/user-activities/current',
  '/api/v1/user-activities/current',
]

async function tryFetch(path, params = {}) {
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return fetch(url.toString(), {
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (!BASE || !KEY) return res.status(500).json({ error: 'Missing env vars' })

  // Find working path
  let workingPath = null
  let actData = null
  for (const path of ACTIVITY_PATHS) {
    const r = await tryFetch(path)
    if (r.ok) { workingPath = path; actData = await r.json(); break }
  }

  if (!workingPath) {
    return res.status(502).json({ error: 'No working path found', tried: ACTIVITY_PATHS, base: BASE })
  }

  try {
    let allUsers = actData.users || actData.results || actData || []
    let pageData = actData
    let page = 2
    while (pageData.next) {
      const r = await tryFetch(workingPath, { page })
      if (!r.ok) break
      pageData = await r.json()
      const rows = pageData.users || pageData.results || pageData || []
      allUsers = allUsers.concat(rows)
      page++
    }

    const available = allUsers
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
    return res.status(500).json({ error: err.message })
  }
}