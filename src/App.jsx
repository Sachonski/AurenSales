import { useAgentStatus, formatDuration } from './useAgentStatus'
import './App.css'

function StatusBadge({ activity }) {
  const label = activity === 'DIRECT_INBOUND' ? 'Direct Line Only' : 'Available – All Calls'
  return <span className={`badge badge--${activity === 'DIRECT_INBOUND' ? 'direct' : 'all'}`}>{label}</span>
}

function TimeBar({ seconds }) {
  // Color shifts green → yellow → red over 30 minutes
  const pct = Math.min(seconds / 1800, 1)
  const hue = Math.round(120 - pct * 120) // 120=green, 0=red
  const color = `hsl(${hue}, 72%, 42%)`
  return (
    <span className="timebar" style={{ color }}>
      {formatDuration(seconds)}
    </span>
  )
}

export default function App() {
  const { agents, loading, error, lastRefresh, refresh } = useAgentStatus()

  return (
    <div className="page">
      <header className="header">
        <div className="header__title">
          <span className="header__dot" />
          <h1>The A-Team — Available Agents</h1>
        </div>
        <div className="header__meta">
          {lastRefresh && (
            <span className="header__ts">
              Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button className="btn-refresh" onClick={refresh} title="Refresh now">
            ↻ Refresh
          </button>
        </div>
      </header>

      <main className="main">
        {loading && !agents.length && (
          <div className="state-msg">Loading agent status…</div>
        )}

        {error && (
          <div className="state-msg state-msg--error">
            Failed to load data: {error}
          </div>
        )}

        {!loading && !error && agents.length === 0 && (
          <div className="state-msg state-msg--empty">
            No agents from The A-Team are currently available for calls.
          </div>
        )}

        {agents.length > 0 && (
          <div className="card">
            <div className="card__header">
              <span className="card__count">{agents.length} available</span>
              <span className="card__hint">Sorted by longest time in status first</span>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agent Name</th>
                  <th>Status</th>
                  <th>Agent Profile</th>
                  <th className="col-time">Time in Status ↓</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => (
                  <tr key={agent.userId} className={i % 2 === 0 ? 'row-even' : 'row-odd'}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-name">{agent.name}</td>
                    <td><StatusBadge activity={agent.activity} /></td>
                    <td className="col-profile">{agent.profileName}</td>
                    <td className="col-time">
                      <TimeBar seconds={agent.liveSeconds} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
