const BASE = (process.env.ONYX_API_BASE_URL || '').replace(/\/$/, '')
const KEY  = process.env.ONYX_API_KEY || ''
const TEAM = 'The A-Team'

function onyxFetch(path, params = {}) {
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return fetch(url.toString(), {
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json' },
  })
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (!BASE || !KEY) {
    return res.status(500).json({ error: 'ONYX_API_BASE_URL and ONYX_API_KEY env vars are required' })
  }

  try {
    const teamsRes = await onyxFetch('/external/v1/teams')
    if (!teamsRes.ok) {
      const text = await teamsRes.text()
      return res.status(502).json({ error: `Teams API ${teamsRes.status}: ${text}` })
    }
    const teamsData = await teamsRes.json()
    const teams = teamsData.teams || teamsData.results || teamsData || []
    const team = teams.find(t => t.name === TEAM)

    let page = 1
    let allUsers = []
    while (true) {
      const actRes = await onyxFetch('/external/v1/user-activities/current', { page })
      if (!actRes.ok) {
        const text = await actRes.text()
        return res.status(502).json({ error: `User Activities API ${actRes.status}: ${text}` })
      }
      const actData = await actRes.json()
      const rows = actData.users || actData.results || actData || []
      allUsers = allUsers.concat(rows)
      if (rows.length === 0 || !actData.next) break
      page++
    }

    const teamMemberIds = team
      ? new Set((team.member_ids || team.members || []).map(String))
      : null

    const available = allUsers
      .filter(u => ['Online', 'Direct Inbound'].includes(u.activity))
      .filter(u => !teamMemberIds || teamMemberIds.has(String(u.id || u.user_id)))
      .map(u => ({
        userId:          u.id || u.user_id,
        name:            u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        activity:        u.activity,
        profileName:     u.worker_profile || u.agent_profile || '—',
        startedAt:       u.started_at,
        secondsInStatus: u.started_at
          ? Math.round((Date.now() - new Date(u.started_at).getTime()) / 1000)
          : 0,
      }))
      .sort((a, b) => b.secondsInStatus - a.secondsInStatus)

    return res.status(200).json({ agents: available, teamFound: !!team })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}