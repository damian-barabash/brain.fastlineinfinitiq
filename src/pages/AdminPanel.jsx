// Ustawienia admina: użytkownicy (klienci), workspace'y, dostawca AI.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { IcPlus, IcTrash, IcKey, IcCheck, IcUsers, IcFolder, IcSpark } from '../components/Icons.jsx'

export default function AdminPanel() {
  const [tab, setTab] = useState('users')
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            strefa administratora
          </div>
          <h1>Admin</h1>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>
          Użytkownicy
        </button>
        <button className={tab === 'ws' ? 'on' : ''} onClick={() => setTab('ws')}>
          Workspace'y
        </button>
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
          Dostawca AI
        </button>
      </div>
      {tab === 'users' && <Users />}
      {tab === 'ws' && <Workspaces />}
      {tab === 'ai' && <AiProvider />}
    </>
  )
}

function Users() {
  const [users, setUsers] = useState(null)
  const [wss, setWss] = useState([])
  const [modal, setModal] = useState(false)
  const [f, setF] = useState({ login: '', password: '', display_name: '', role: 'client', workspace_id: '' })
  const [err, setErr] = useState('')

  async function load() {
    const [u, w] = await Promise.all([api('users.list'), api('ws.list')])
    setUsers(u.users)
    setWss(w.workspaces)
  }
  useEffect(() => {
    load()
  }, [])

  async function create() {
    setErr('')
    try {
      await api('users.create', { ...f, workspace_id: f.workspace_id || null })
      setModal(false)
      setF({ login: '', password: '', display_name: '', role: 'client', workspace_id: '' })
      load()
    } catch (e) {
      setErr(e.message)
    }
  }
  async function resetPass(u) {
    const p = prompt(`Nowe hasło dla ${u.login} (min. 6 znaków):`)
    if (!p) return
    await api('users.update', { id: u.id, password: p })
    alert('Hasło zmienione.')
  }
  async function toggleDisabled(u) {
    await api('users.update', { id: u.id, disabled: !u.disabled })
    load()
  }
  async function del(u) {
    if (!confirm(`Usunąć użytkownika ${u.login}?`)) return
    await api('users.delete', { id: u.id })
    load()
  }
  const wsName = (id) => wss.find((w) => w.id === id)?.name || '—'

  if (!users) return <p className="muted">Ładowanie…</p>
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <p className="muted">Klient dostaje dostęp do całego workspace'u (wszystkich jego projektów).</p>
        <button className="btn right" onClick={() => setModal(true)}>
          <IcPlus /> Nowy użytkownik
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Login</th>
              <th>Nazwa</th>
              <th>Rola</th>
              <th>Workspace</th>
              <th>Ostatnie logowanie</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.login}</b> {u.disabled && <span className="badge danger">Zablokowany</span>}
                </td>
                <td>{u.display_name || '—'}</td>
                <td>{u.role === 'admin' ? <span className="badge acid">Admin</span> : <span className="badge">Klient</span>}</td>
                <td>{u.role === 'admin' ? 'wszystkie' : wsName(u.workspace_id)}</td>
                <td className="mono" style={{ fontSize: 10.5 }}>
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </td>
                <td>
                  <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => resetPass(u)} title="Reset hasła">
                      <IcKey />
                    </button>
                    <button className="btn sm" onClick={() => toggleDisabled(u)} title={u.disabled ? 'Odblokuj' : 'Zablokuj'}>
                      {u.disabled ? <IcCheck /> : <IcUsers />}
                    </button>
                    <button className="btn sm danger" onClick={() => del(u)} title="Usuń">
                      <IcTrash />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <h2>Nowy użytkownik</h2>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="f">
                <span className="mono">Login</span>
                <input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} />
              </label>
              <label className="f">
                <span className="mono">Hasło</span>
                <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              </label>
            </div>
            <label className="f">
              <span className="mono">Wyświetlana nazwa</span>
              <input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
            </label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="f">
                <span className="mono">Rola</span>
                <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                  <option value="client">Klient</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {f.role === 'client' && (
                <label className="f">
                  <span className="mono">Workspace klienta</span>
                  <select value={f.workspace_id} onChange={(e) => setF({ ...f, workspace_id: e.target.value })}>
                    <option value="">— wybierz —</option>
                    {wss.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {err && <p className="err">{err}</p>}
            <div className="acts">
              <button className="btn" onClick={() => setModal(false)}>
                Anuluj
              </button>
              <button className="btn primary" onClick={create} disabled={!f.login || !f.password || (f.role === 'client' && !f.workspace_id)}>
                Utwórz
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Workspaces() {
  const [wss, setWss] = useState(null)
  async function load() {
    const d = await api('ws.list')
    setWss(d.workspaces)
  }
  useEffect(() => {
    load()
  }, [])

  async function rename(w) {
    const name = prompt('Nowa nazwa workspace:', w.name)
    if (!name) return
    await api('ws.rename', { id: w.id, name })
    load()
  }
  async function del(w) {
    if (!confirm(`Usunąć workspace „${w.name}" wraz ze WSZYSTKIMI projektami i danymi?`)) return
    await api('ws.delete', { id: w.id })
    load()
  }

  if (!wss) return <p className="muted">Ładowanie…</p>
  return (
    <div className="grid g3">
      {wss.map((w) => (
        <div className="card" key={w.id}>
          <div className="row">
            <IcFolder style={{ width: 17, height: 17, color: 'var(--acid)' }} />
            <b>{w.name}</b>
            <span className="right row" style={{ gap: 4 }}>
              <button className="btn sm" onClick={() => rename(w)}>
                Zmień nazwę
              </button>
              <button className="btn sm danger" onClick={() => del(w)}>
                <IcTrash />
              </button>
            </span>
          </div>
          <p className="mono" style={{ marginTop: 8, fontSize: 9.5 }}>
            utworzony {new Date(w.created_at).toLocaleDateString('pl-PL')}
          </p>
        </div>
      ))}
      <div className="card muted">Nowy workspace tworzysz na ekranie wyboru (po zalogowaniu).</div>
    </div>
  )
}

function AiProvider() {
  const [cfg, setCfg] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api('settings.get').then((d) => setCfg(d.settings.ai_provider || {}))
  }, [])

  async function save() {
    await api('settings.set', { key: 'ai_provider', value: cfg })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  if (!cfg) return <p className="muted">Ładowanie…</p>
  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.value }))
  return (
    <div className="grid g2">
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <IcSpark style={{ width: 18, height: 18, color: 'var(--acid)' }} />
          <b>Dostawca modelu (OpenAI-compatible)</b>
          {saved && <span className="badge ok">Zapisano</span>}
        </div>
        <label className="f">
          <span className="mono">Base URL (puste = Barabash AI z sekretów)</span>
          <input value={cfg.base_url || ''} onChange={set('base_url')} placeholder="https://api.deepseek.com" />
        </label>
        <label className="f">
          <span className="mono">Model</span>
          <input value={cfg.model || ''} onChange={set('model')} placeholder="qwen3.5:9b / deepseek-chat" />
        </label>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="f">
            <span className="mono">Temperature</span>
            <input type="number" step="0.1" min="0" max="2" value={cfg.temperature ?? 0.6} onChange={(e) => setCfg((c) => ({ ...c, temperature: Number(e.target.value) }))} />
          </label>
          <label className="f">
            <span className="mono">Max tokens</span>
            <input type="number" min="100" max="4000" value={cfg.max_tokens ?? 700} onChange={(e) => setCfg((c) => ({ ...c, max_tokens: Number(e.target.value) }))} />
          </label>
        </div>
        <label className="f">
          <span className="mono">Nazwa sekretu z kluczem API</span>
          <input value={cfg.key_secret || 'BRAIN_AI_KEY'} onChange={set('key_secret')} />
        </label>
        <button className="btn primary" onClick={save}>
          Zapisz konfigurację
        </button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Jak przełączyć na innego dostawcę</h3>
        <ol style={{ paddingLeft: 18, color: 'var(--dim)', fontSize: 13, display: 'grid', gap: 8 }}>
          <li>Dodaj sekret z kluczem API w Supabase (np. <code className="mono">DEEPSEEK_KEY</code>).</li>
          <li>Wpisz Base URL dostawcy (endpoint musi być zgodny z OpenAI <code className="mono">/v1/chat/completions</code>).</li>
          <li>Podaj model i nazwę sekretu, zapisz — zmiana działa od następnej wiadomości, bez deployu.</li>
        </ol>
        <div className="spacer" />
        <p className="muted">
          Obecnie: Barabash AI (własny serwer, model rezydentny w pamięci — pierwsze tokeny w ~1 s). Streaming SSE
          włączony zawsze.
        </p>
      </div>
    </div>
  )
}
