// Wybór workspace → projekt (z tworzeniem na każdym kroku).
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, session } from '../lib/api.js'
import { useCached, invalidate } from '../lib/useCached.js'
import { IcFolder, IcBox, IcPlus, IcLogout, IcArrowR } from '../components/Icons.jsx'

export default function Picker() {
  const nav = useNavigate()
  const loc = useLocation()
  const user = session.user
  const [ws, setWs] = useState(null) // wybrany workspace
  const [wsData, refreshWs] = useCached('ws.list', {})
  const workspaces = wsData?.workspaces ?? null
  const [projects, setProjects] = useState(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // wejście z przycisku PR w sidebarze — od razu wybór projektu w bieżącym workspace
    const openWs = loc.state?.openWs
    if (openWs && !ws) {
      pick(openWs)
      return
    }
    // klient z jednym workspace — od razu do projektów
    if (user?.role !== 'admin' && workspaces?.length === 1 && !ws) pick(workspaces[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces])

  async function pick(w) {
    setWs(w)
    setProjects(null)
    const d = await api('proj.list', { workspace_id: w.id })
    setProjects(d.projects)
  }

  async function createWs() {
    if (!newName.trim() || busy) return
    setBusy(true)
    try {
      const { workspace } = await api('ws.create', { name: newName.trim() })
      setNewName('')
      invalidate('ws.list')
      refreshWs()
      pick(workspace)
    } finally {
      setBusy(false)
    }
  }

  async function createProj() {
    if (!newName.trim() || busy) return
    setBusy(true)
    try {
      const { project } = await api('proj.create', { workspace_id: ws.id, name: newName.trim() })
      setNewName('')
      choose(project)
    } finally {
      setBusy(false)
    }
  }

  function choose(p) {
    session.setWs(ws)
    session.setProj(p)
    nav('/app/dashboard')
  }

  function logout() {
    api('logout').catch(() => {})
    session.clear()
    nav('/login')
  }

  const stage = ws ? 'proj' : 'ws'
  return (
    <div className="center-page">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {user?.display_name || user?.login}
          </div>
          <button className="btn sm" onClick={logout}>
            <IcLogout /> Wyloguj
          </button>
        </div>
        <h1 style={{ marginTop: 18 }}>{stage === 'ws' ? 'Wybierz workspace' : ws.name}</h1>
        <p className="sub">
          {stage === 'ws' ? 'Workspace grupuje projekty i klientów.' : 'Wybierz projekt albo utwórz nowy.'}
        </p>

        {stage === 'ws' && (
          <>
            <div className="picker-list">
              {workspaces === null && <p className="muted">Ładowanie…</p>}
              {workspaces?.map((w) => (
                <button key={w.id} className="item" onClick={() => pick(w)}>
                  <span className="row" style={{ gap: 10 }}>
                    <IcFolder /> {w.name}
                  </span>
                  <IcArrowR style={{ width: 15, height: 15, color: 'var(--dim2)' }} />
                </button>
              ))}
              {workspaces?.length === 0 && <p className="muted">Brak workspace'ów — utwórz pierwszy.</p>}
            </div>
            {user?.role === 'admin' && (
              <div className="row">
                <input
                  placeholder="Nazwa nowego workspace"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createWs()}
                  style={{ flex: 1 }}
                />
                <button className="btn" onClick={createWs} disabled={busy}>
                  <IcPlus /> Utwórz
                </button>
              </div>
            )}
          </>
        )}

        {stage === 'proj' && (
          <>
            <div className="picker-list">
              {projects === null && <p className="muted">Ładowanie…</p>}
              {projects?.map((p) => (
                <button key={p.id} className="item" onClick={() => choose(p)}>
                  <span className="row" style={{ gap: 10 }}>
                    <IcBox /> {p.name}
                  </span>
                  <IcArrowR style={{ width: 15, height: 15, color: 'var(--dim2)' }} />
                </button>
              ))}
              {projects?.length === 0 && <p className="muted">Brak projektów — utwórz pierwszy.</p>}
            </div>
            <div className="row">
              <input
                placeholder="Nazwa nowego projektu"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createProj()}
                style={{ flex: 1 }}
              />
              <button className="btn" onClick={createProj} disabled={busy}>
                <IcPlus /> Utwórz
              </button>
            </div>
            <div className="spacer" />
            <button className="btn sm" onClick={() => setWs(null)}>
              ← Inny workspace
            </button>
          </>
        )}
      </div>
    </div>
  )
}
