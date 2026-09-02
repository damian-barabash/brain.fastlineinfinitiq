// Wspólny wybór: PRODUKT → workspace → projekt. Ten sam ekran w każdym produkcie.
// Gdy klient wybierze produkt z innej domeny — przenosimy go tam z sesją (#sso).
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, session, gotoProduct, takePendingProduct } from './platform.js'
import { IcFolder, IcBox, IcPlus, IcLogout, IcArrowR, IcBrain, IcHand, IcSpark } from './Icons.jsx'

const SENSE_ICON = { Brain: IcBrain, Hand: IcHand }

export default function Picker({ productKey, onDone }) {
  const user = session.user
  // Panel woła ten ekran z konkretnym krokiem: przycisk WS ma otwierać wybór
  // workspace'u, PR — wybór projektu, a produkt zmienia się osobnym przyciskiem.
  const wanted = useLocation().state?.stage
  const [stage, setStage] = useState('product')
  const [products, setProducts] = useState(null)
  const [workspaces, setWorkspaces] = useState(null)
  const [ws, setWs] = useState(null)
  const [projects, setProjects] = useState(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    // produkt wybrany jeszcze w poprzedniej domenie (przejście przez #sso)
    const pending = takePendingProduct()
    api('products.mine')
      .then((d) => {
        if (!alive) return
        const list = d.products ?? []
        setProducts(list)
        // klient już wybrał ten produkt (albo ma tylko ten jeden) — nie pytamy drugi raz
        const here = list.find((p) => p.key === productKey)
        if (wanted === 'product') return // wprost poproszono o wybór produktu
        const auto =
          (wanted && here) || // wejście z panelu: produkt jest już wybrany
          (pending && list.find((p) => p.key === pending && p.key === productKey)) ||
          (list.length === 1 && list[0].key === productKey ? list[0] : null)
        if (auto) pickProduct(auto === true ? here : auto, true)
      })
      .catch((e) => setErr(e.message))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pickProduct(p, silent) {
    if (p.key !== productKey) {
      session.setProduct(p)
      gotoProduct(p)
      return
    }
    session.setProduct(p)
    setStage('ws')
    if (!silent) setNewName('')
    try {
      const d = await api('ws.list')
      const list = d.workspaces ?? []
      setWorkspaces(list)
      // prośba o wybór projektu: workspace jest już znany, przeskakujemy krok
      if (wanted === 'proj' && session.ws) {
        const cur = list.find((w) => w.id === session.ws.id)
        if (cur) return pickWs(cur)
      }
      if (user?.role !== 'admin' && list.length === 1) pickWs(list[0])
    } catch (e) {
      setErr(e.message)
    }
  }

  async function pickWs(w) {
    setWs(w)
    setProjects(null)
    setStage('proj')
    try {
      const d = await api('proj.list', { workspace_id: w.id })
      setProjects(d.projects ?? [])
    } catch (e) {
      setErr(e.message)
    }
  }

  async function createWs() {
    if (!newName.trim() || busy) return
    setBusy(true)
    try {
      const { workspace } = await api('ws.create', { name: newName.trim() })
      setNewName('')
      pickWs(workspace)
    } catch (e) {
      setErr(e.message)
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
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  function choose(p) {
    session.setWs(ws)
    session.setProj(p)
    onDone()
  }

  function logout() {
    api('logout').catch(() => {})
    session.clear()
    location.replace('/login')
  }

  const title = stage === 'product' ? 'Wybierz produkt' : stage === 'ws' ? 'Wybierz workspace' : ws?.name
  const sub =
    stage === 'product'
      ? 'Produkty przypisane do Twojego konta.'
      : stage === 'ws'
        ? 'Workspace grupuje projekty i klientów — wspólny dla wszystkich produktów.'
        : 'Wybierz projekt albo utwórz nowy.'

  return (
    <div className="center-page" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {user?.display_name || user?.login}
          </div>
          <button className="btn sm" onClick={logout}>
            <IcLogout /> Wyloguj
          </button>
        </div>
        <h1 style={{ marginTop: 18 }}>{title}</h1>
        <p className="sub">{sub}</p>
        {err && <p className="muted" style={{ color: 'var(--danger)' }}>{err}</p>}

        {stage === 'product' && (
          <div className="picker-list">
            {products === null && <p className="muted">Ładowanie…</p>}
            {products?.length === 0 && (
              <div className="empty" style={{ padding: '18px 4px' }}>
                <p style={{ marginBottom: 6 }}>Nie masz jeszcze przypisanego żadnego produktu.</p>
                <p className="muted">
                  Skontaktuj się z administratorem Fastline InfinitiQ — nada dostęp do produktu dla Twojego workspace'u.
                </p>
              </div>
            )}
            {products?.map((p) => {
              const Ic = SENSE_ICON[p.sense] ?? IcSpark
              return (
                <button key={p.key} className="item" onClick={() => pickProduct(p)}>
                  {/* nowrap + flexShrink: przy dłuższym opisie ikona uciekała do
                      własnej linii i karty produktów wyglądały jak dwa różne wzory */}
                  <span className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <Ic style={{ color: p.accent || 'var(--acid)', marginTop: 2, flexShrink: 0 }} />
                    <span style={{ display: 'grid', gap: 3, textAlign: 'left' }}>
                      <b>{p.name}</b>
                      <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>{p.tagline}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>
                        {p.sense} · {p.domain}
                      </span>
                    </span>
                  </span>
                  <IcArrowR style={{ width: 15, height: 15, color: 'var(--dim2)' }} />
                </button>
              )
            })}
          </div>
        )}

        {stage === 'ws' && (
          <>
            <div className="picker-list">
              {workspaces === null && <p className="muted">Ładowanie…</p>}
              {workspaces?.map((w) => (
                <button key={w.id} className="item" onClick={() => pickWs(w)}>
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
            {(products?.length ?? 0) > 1 && (
              <>
                <div className="spacer" />
                <button className="btn sm" onClick={() => setStage('product')}>← Inny produkt</button>
              </>
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
            {user?.role === 'admin' && (
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
            )}
            <div className="spacer" />
            <button className="btn sm" onClick={() => { setWs(null); setStage('ws') }}>← Inny workspace</button>
          </>
        )}
      </div>
    </div>
  )
}
