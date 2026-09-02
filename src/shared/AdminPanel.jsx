// Wspólna strefa admina — IDENTYCZNA w każdym produkcie (Brain, Hand, …).
// ŹRÓDŁO PRAWDY: fiq-shared. Zarządza całą platformą z dowolnej domeny:
// użytkownicy, workspace'y, przypisanie produktów, dostawca AI, integracje.
import { useEffect, useState } from 'react'
import { api } from './platform.js'
import { IcPlus, IcTrash, IcKey, IcCheck, IcUsers, IcFolder, IcSpark, IcBox, IcLinkedIn, IcRefresh, IcMap } from './Icons.jsx'

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
        <button className={tab === 'prod' ? 'on' : ''} onClick={() => setTab('prod')}>
          Produkty
        </button>
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
          Dostawca AI
        </button>
        <button className={tab === 'int' ? 'on' : ''} onClick={() => setTab('int')}>
          Integracje
        </button>
      </div>
      {tab === 'users' && <Users />}
      {tab === 'ws' && <Workspaces />}
      {tab === 'prod' && <Products />}
      {tab === 'ai' && <AiProvider />}
      {tab === 'int' && <Integrations />}
    </>
  )
}

function Users() {
  const [users, setUsers] = useState(null)
  const [wss, setWss] = useState([])
  const [modal, setModal] = useState(false)
  const [projModal, setProjModal] = useState(null)
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
        <p className="muted">
          Klient widzi produkty przypisane do jego workspace'u (zakładka „Produkty"). Domyślnie ma dostęp do
          wszystkich projektów workspace'u — przyciskiem <b>projekty</b> możesz zawęzić do wybranych.
        </p>
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
                    {u.role !== 'admin' && (
                      <button className="btn sm" onClick={() => setProjModal(u)} title="Dostęp do projektów">
                        <IcBox />
                      </button>
                    )}
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
      {projModal && <UserProjects user={projModal} onClose={() => setProjModal(null)} />}
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
  const [prods, setProds] = useState([])
  const [map, setMap] = useState({}) // workspace_id → [product_key]
  async function load() {
    const [d, pr, wp] = await Promise.all([api('ws.list'), api('products.list'), api('ws.products')])
    setWss(d.workspaces)
    setProds(pr.products ?? [])
    setMap(wp.map ?? {})
  }
  async function toggleProduct(w, key, on) {
    setMap((m) => ({ ...m, [w.id]: on ? [...(m[w.id] ?? []), key] : (m[w.id] ?? []).filter((k) => k !== key) }))
    try {
      await api('ws.products.set', { workspace_id: w.id, product_key: key, enabled: on })
    } catch (e) {
      alert('Nie udało się zapisać: ' + e.message)
      load()
    }
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
          <div className="f" style={{ marginTop: 12 }}>
            <span className="mono">Produkty tego workspace'u</span>
            <div className="chips" style={{ marginTop: 6 }}>
              {prods.map((p) => {
                const on = (map[w.id] ?? []).includes(p.key)
                return (
                  <button key={p.key} type="button" className={on ? 'on' : ''} onClick={() => toggleProduct(w, p.key, !on)}>
                    {p.name}
                  </button>
                )
              })}
              {prods.length === 0 && <span className="muted">Brak produktów w rejestrze.</span>}
            </div>
          </div>
          <p className="mono" style={{ marginTop: 10, fontSize: 9.5 }}>
            utworzony {new Date(w.created_at).toLocaleDateString('pl-PL')}
          </p>
        </div>
      ))}
      <div className="card muted">
        Nowy workspace tworzysz na ekranie wyboru (po zalogowaniu). Workspace, projekty i baza wiedzy są
        WSPÓLNE dla wszystkich produktów — klient przypisany do Brain i do Hand pracuje na tych samych danych.
      </div>
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

// ── dostęp klienta do wybranych projektów (puste = wszystkie w workspace) ────
function UserProjects({ user, onClose }) {
  const [projects, setProjects] = useState(null)
  const [checked, setChecked] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [p, u] = await Promise.all([
        api('proj.list', { workspace_id: user.workspace_id }),
        api('user.projects', { user_id: user.id }),
      ])
      setProjects(p.projects ?? [])
      setChecked(u.project_ids ?? [])
    })().catch(() => setProjects([]))
  }, [user])

  async function save() {
    setBusy(true)
    try {
      await api('user.projects.set', { user_id: user.id, project_ids: checked })
      onClose()
    } catch (e) {
      alert('Błąd zapisu: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Projekty dla {user.display_name || user.login}</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Nic nie zaznaczone = klient widzi wszystkie projekty swojego workspace'u. Zaznaczenie zawęża dostęp
          do wybranych — działa we wszystkich produktach naraz.
        </p>
        {projects === null && <p className="muted">Ładowanie…</p>}
        <div className="picker-list" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {projects?.map((p) => {
            const on = checked.includes(p.id)
            return (
              <button
                key={p.id}
                className="item"
                onClick={() => setChecked(on ? checked.filter((x) => x !== p.id) : [...checked, p.id])}
              >
                <span className="row" style={{ gap: 10 }}>
                  <IcBox /> {p.name}
                </span>
                {on ? <IcCheck style={{ color: 'var(--acid)' }} /> : <span className="muted mono">—</span>}
              </button>
            )
          })}
          {projects?.length === 0 && <p className="muted">Ten workspace nie ma jeszcze projektów.</p>}
        </div>
        <div className="acts">
          <button className="btn" onClick={onClose}>Anuluj</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz dostęp'}</button>
        </div>
      </div>
    </div>
  )
}

// ── rejestr produktów platformy ─────────────────────────────────────────────
function Products() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)

  const load = () => api('products.list').then((d) => setRows(d.products ?? []))
  useEffect(() => {
    load()
  }, [])

  async function save() {
    await api('products.set', { product: edit })
    setEdit(null)
    load()
  }

  if (!rows) return <p className="muted">Ładowanie…</p>
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <p className="muted">
          Rejestr produktów platformy — to z niego buduje się ekran wyboru po zalogowaniu. Przypisanie do
          klientów robisz w zakładce „Workspace'y".
        </p>
        <button className="btn right" onClick={() => setEdit({ key: '', name: '', sense: 'Hand', domain: '', tagline: '', accent: '#B8FF00', active: true, sort: (rows.length + 1) * 10 })}>
          <IcPlus /> Nowy produkt
        </button>
      </div>
      <div className="grid g3">
        {rows.map((p) => (
          <div className="card" key={p.key}>
            <div className="row">
              <span className="dot" style={{ background: p.accent }} />
              <b>{p.name}</b>
              {!p.active && <span className="badge">wyłączony</span>}
              <button className="btn sm right" onClick={() => setEdit(p)}>Edytuj</button>
            </div>
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>{p.tagline}</p>
            <p className="mono" style={{ marginTop: 8, fontSize: 10 }}>{p.sense} · {p.domain} · klucz {p.key}</p>
          </div>
        ))}
      </div>
      {edit && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal">
            <h2>{edit.key ? 'Produkt: ' + edit.name : 'Nowy produkt'}</h2>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="f">
                <span className="mono">Klucz (subdomena)</span>
                <input value={edit.key} onChange={(e) => setEdit({ ...edit, key: e.target.value.trim().toLowerCase() })} placeholder="hand" />
              </label>
              <label className="f">
                <span className="mono">Nazwa</span>
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="LeadEngine" />
              </label>
            </div>
            <label className="f">
              <span className="mono">Jednym zdaniem</span>
              <input value={edit.tagline} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} />
            </label>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <label className="f">
                <span className="mono">Zmysł</span>
                <select value={edit.sense} onChange={(e) => setEdit({ ...edit, sense: e.target.value })}>
                  {['Brain', 'Mind', 'Hand', 'Heart', 'Eyes'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="f">
                <span className="mono">Domena</span>
                <input value={edit.domain} onChange={(e) => setEdit({ ...edit, domain: e.target.value.trim() })} />
              </label>
              <label className="f">
                <span className="mono">Akcent</span>
                <input value={edit.accent} onChange={(e) => setEdit({ ...edit, accent: e.target.value.trim() })} />
              </label>
            </div>
            <label className="f row" style={{ gap: 10 }}>
              <input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
              <span>Aktywny (widoczny na ekranie wyboru)</span>
            </label>
            <div className="acts">
              <button className="btn" onClick={() => setEdit(null)}>Anuluj</button>
              <button className="btn primary" onClick={save} disabled={!edit.key || !edit.name}>Zapisz</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── integracje platformy: jeden token Unipile na całą instalację ─────────────
function Integrations() {
  const [uni, setUni] = useState(null)
  const [maps, setMaps] = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [mapsState, setMapsState] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const note = (t) => {
    setMsg(t)
    setTimeout(() => setMsg(''), 5000)
  }

  useEffect(() => {
    api('settings.get').then((d) => {
      setUni(d.settings.unipile || { dsn: '', api_key: '', key_secret: 'UNIPILE_TOKEN' })
      setMaps(d.settings.maps || { api_key: '', key_secret: 'GOOGLE_MAPS_KEY' })
    })
  }, [])

  async function save(key, value, after) {
    setBusy(key)
    try {
      await api('settings.set', { key, value })
      note('Zapisano.')
      if (after) await after()
    } catch (e) {
      note('Błąd: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  async function loadAccounts() {
    setBusy('acc')
    try {
      const d = await api('unipile.accounts')
      setAccounts(d.accounts ?? [])
      if (!d.accounts?.length) note('Token działa, ale nie ma podłączonych kont.')
    } catch (e) {
      note('Błąd: ' + e.message)
      setAccounts([])
    } finally {
      setBusy('')
    }
  }

  async function checkMaps() {
    setBusy('maps')
    try {
      setMapsState(await api('maps.check'))
    } catch (e) {
      setMapsState({ ok: false, error: e.message })
    } finally {
      setBusy('')
    }
  }

  if (!uni || !maps) return <p className="muted">Ładowanie…</p>
  return (
    <div className="grid g2">
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <IcLinkedIn style={{ width: 18, height: 18, color: 'var(--acid)' }} />
          <b>Unipile — LinkedIn</b>
          <a className="right mono link-dim" href="https://dashboard.unipile.com" target="_blank" rel="noreferrer">
            gdzie to skonfigurować ↗
          </a>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Jeden token na całą platformę (jak dostawca AI). Konta LinkedIn podpinasz w panelu Unipile, a tutaj tylko
          wklejasz token — z którego konta szuka dany projekt, wybierasz w produkcie Hand → Integracje.
        </p>
        <label className="f">
          <span className="mono">DSN instancji</span>
          <input
            value={uni.dsn || ''}
            onChange={(e) => setUni({ ...uni, dsn: e.target.value.trim() })}
            placeholder="api8.unipile.com:13843"
          />
        </label>
        <label className="f">
          <span className="mono">Token API</span>
          <input
            type="password"
            value={uni.api_key || ''}
            onChange={(e) => setUni({ ...uni, api_key: e.target.value })}
            placeholder={uni.api_key ? '' : 'wklej token'}
          />
        </label>
        <p className="muted" style={{ fontSize: 11.5, marginTop: -4 }}>
          Zapisany token wraca zamaskowany — zostaw jak jest, żeby go nie zmieniać.
        </p>
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => save('unipile', uni, loadAccounts)} disabled={busy === 'unipile'}>
            {busy === 'unipile' ? 'Zapisywanie…' : 'Zapisz i sprawdź'}
          </button>
          <button className="btn" onClick={loadAccounts} disabled={busy === 'acc'}>
            <IcRefresh /> {busy === 'acc' ? 'Sprawdzam…' : 'Pobierz konta'}
          </button>
        </div>
        {accounts !== null && (
          <div style={{ marginTop: 14 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--dim2)' }}>PODŁĄCZONE KONTA</span>
            {accounts.map((a) => (
              <div className="row" key={a.id} style={{ padding: '7px 0', borderTop: '1px solid var(--line)' }}>
                <IcLinkedIn style={{ width: 14, height: 14, color: 'var(--acid)' }} />
                <span>{a.name || a.id}</span>
                <span className="right mono" style={{ fontSize: 10 }}>{a.type} · {a.status}</span>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="muted" style={{ marginTop: 6 }}>
                Brak kont —{' '}
                <a className="link-dim" href="https://dashboard.unipile.com" target="_blank" rel="noreferrer">
                  podłącz LinkedIn w Unipile ↗
                </a>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <IcMap style={{ width: 18, height: 18, color: 'var(--acid)' }} />
          <b>Google Places — firmy z mapy</b>
          <a
            className="right mono link-dim"
            href="https://console.cloud.google.com/apis/library/places.googleapis.com"
            target="_blank"
            rel="noreferrer"
          >
            gdzie to skonfigurować ↗
          </a>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Źródło leadów lokalnych: nazwa, adres, telefon, strona, oceny. Klucz jeden na całą platformę. W projekcie
          Google musi być włączone <b>Places API (New)</b> — inaczej klucz odpowie błędem mimo że jest poprawny.
        </p>
        <label className="f">
          <span className="mono">Klucz API</span>
          <input
            type="password"
            value={maps.api_key || ''}
            onChange={(e) => setMaps({ ...maps, api_key: e.target.value })}
            placeholder={maps.api_key ? '' : 'wklej klucz'}
          />
        </label>
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => save('maps', maps, checkMaps)} disabled={busy === 'maps'}>
            {busy === 'maps' ? 'Sprawdzam…' : 'Zapisz i sprawdź'}
          </button>
          <button className="btn" onClick={checkMaps} disabled={busy === 'maps'}>
            <IcRefresh /> Sprawdź klucz
          </button>
        </div>
        {mapsState && (
          <div className="note" style={{ marginTop: 12 }}>
            {mapsState.ok ? (
              <span>
                <b style={{ color: 'var(--acid)' }}>Działa.</b> Przykładowy wynik: {mapsState.sample || '—'}
              </span>
            ) : (
              <span>
                <b style={{ color: 'var(--danger)' }}>Nie działa.</b> {mapsState.error}{' '}
                <a
                  className="link-dim"
                  href={mapsState.activation_url || 'https://console.cloud.google.com/apis/library/places.googleapis.com'}
                  target="_blank"
                  rel="noreferrer"
                >
                  włącz API tutaj ↗
                </a>
              </span>
            )}
          </div>
        )}
      </div>
      {msg && (
        <p className="muted" style={{ gridColumn: '1 / -1' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
