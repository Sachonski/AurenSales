import { useState, useEffect, useCallback } from 'react'

const REFRESH_MS = 30_000

export function formatDuration(seconds) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

async function fetchAgents() {
  const res = await fetch('/api/agents')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.agents || []
}

export function useAgentStatus() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchAgents()
      setAgents(rows)
      setError(null)
      setLastRefresh(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const liveAgents = agents.map((a) => {
    const elapsed = lastRefresh ? Math.round((Date.now() - lastRefresh.getTime()) / 1000) : 0
    return { ...a, liveSeconds: a.secondsInStatus + elapsed }
  })

  liveAgents.sort((a, b) => b.liveSeconds - a.liveSeconds)

  return { agents: liveAgents, loading, error, lastRefresh, refresh }
}
