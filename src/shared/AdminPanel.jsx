// Wspólna strefa admina — IDENTYCZNA w każdym produkcie (Brain, Hand, …).
// ŹRÓDŁO PRAWDY: fiq-shared. Zarządza całą platformą z dowolnej domeny:
// użytkownicy, workspace'y, przypisanie produktów, dostawca AI, integracje.
import { useEffect, useState } from 'react'
import { api } from './platform.js'
import IntegrationsAdmin from './IntegrationsAdmin.jsx'
import { IcPlus, IcTrash, IcKey, IcCheck, IcUsers, IcFolder, IcSpark, IcBox, IcLinkedIn, IcRefresh, IcMap } from './Icons.jsx'
import { SkelList, SkelCard } from './Skeleton.jsx'

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
        <button className={tab === 'int' ? 'on' : ''} onClick={() => setTab('int')}>
          Integracje
        </button>
      </div>
      {tab === 'users' && <Users />}
      {tab === 'ws' && <Workspaces />}
      {tab === 'prod' && <Products />}
      {tab === 'int' && <IntegrationsAdmin />}
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

  if (!users) return <SkelList rows={5} />
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

  if (!wss) return <SkelList rows={3} />
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
        {projects === null && <SkelList rows={3} />}
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

  if (!rows) return <SkelList rows={4} />
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
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Lead Engine" />
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
