// Layout panelu: wysuwane menu (zwinięte = same ikony) + content.
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { api, session, getTheme, setTheme } from '../lib/api.js'
import { warm } from '../lib/useCached.js'
import { ensureProductAccess } from '../shared/platform.js'
import { PRODUCTS, PRODUCT_FALLBACK } from '../lib/products.js'
import {
  IcDash,
  IcBot,
  IcBook,
  IcGear,
  IcShield,
  IcLogout,
  IcSun,
  IcMoon,
  IcChevL,
  IcChevR,
  IcTarget,
  IcGlobe,
} from './Icons.jsx'
import { SkelPage } from '../shared/Skeleton.jsx'

const Dashboard = lazy(() => import('../pages/Dashboard.jsx'))
const Advisor = lazy(() => import('../pages/Advisor.jsx'))
const Sales = lazy(() => import('../pages/Sales.jsx'))
const Knowledge = lazy(() => import('../pages/Knowledge.jsx'))
const Settings = lazy(() => import('../pages/Settings.jsx'))
const Integrations = lazy(() => import('../pages/Integrations.jsx'))
const AdminPanel = lazy(() => import('../pages/AdminPanel.jsx'))

export default function Shell() {
  const nav = useNavigate()
  const [open, setOpen] = useState(window.innerWidth > 900)
  const [theme, setThemeState] = useState(getTheme())
  const user = session.user
  const ws = session.ws
  const proj = session.proj
  // Ta aplikacja jest domem DWÓCH produktów platformy: AI Doradca i AI Sprzedawca
  // (dawniej jeden parasol „Agenci AI"). Trzeci agent — AI Asystent — dojdzie,
  // gdy powstanie jego moduł. Wybór produktu decyduje, którą sekcję widzi klient;
  // workspace'y, projekty i baza wiedzy zostają wspólne.
  const [product, setProduct] = useState(session.product ?? PRODUCT_FALLBACK)
  // Wybrany produkt wyznacza kontekst pracy — także administratorowi. Żeby wejść
  // do drugiego agenta, przełącza się produkt przyciskiem PD (nie ma dwóch sekcji naraz).
  const isAdvisor = product.key === 'advisor'
  const isSales = product.key === 'sales'

  // Dostęp do produktu daje workspace klienta — stara sesja w localStorage nie
  // może wpuścić do Brain kogoś, komu produkt odebrano.
  useEffect(() => {
    let alive = true
    ensureProductAccess(PRODUCTS)
      .then(({ ok, product: cur }) => {
        if (!alive) return
        if (!ok) {
          session.setProj(null)
          nav('/', { replace: true })
          return
        }
        if (cur) setProduct(cur)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // prefetch: chunki stron + dane wszystkich sekcji — nawigacja bez czekania
  useEffect(() => {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300))
    idle(() => {
      import('../pages/Dashboard.jsx')
      if (isAdvisor) import('../pages/Advisor.jsx')
      if (isSales) import('../pages/Sales.jsx')
      import('../pages/Knowledge.jsx')
      import('../pages/Settings.jsx')
      import('../pages/Integrations.jsx')
      if (user?.role === 'admin') import('../pages/AdminPanel.jsx')
      warm('stats', { project_id: proj.id, days: 30, channel_type: undefined })
      warm('kb.list', { project_id: proj.id })
      warm('channels.list', { project_id: proj.id })
      if (isAdvisor) warm('advisor.get', { project_id: proj.id })
      if (isSales) {
        warm('sales.get', { project_id: proj.id })
        warm('leads.list', { project_id: proj.id })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj.id, product.key])

  function toggleTheme() {
    const t = theme === 'dark' ? 'light' : 'dark'
    setTheme(t)
    setThemeState(t)
  }
  function logout() {
    api('logout').catch(() => {})
    session.clear()
    nav('/login')
  }

  // Klient widzi tylko tego agenta, którego ma wykupionego. Reszta (pulpit,
  // baza wiedzy, integracje, ustawienia) jest wspólna dla obu produktów.
  const items = [
    { to: '/app/dashboard', label: 'Dashboard', icon: <IcDash /> },
    isAdvisor && { to: '/app/advisor', label: 'AI Doradca', icon: <IcBot /> },
    isSales && { to: '/app/sales', label: 'AI Sprzedawca', icon: <IcTarget /> },
    { to: '/app/knowledge', label: 'Baza wiedzy', icon: <IcBook /> },
  ].filter(Boolean)

  return (
    <div className="shell">
      <aside className={`sb ${open ? '' : 'closed'}`}>
        <div className="sb-top">
          <div className="sb-logo">
            <img className="mark-img" src="/favicon-192.png" alt="InfinitiQ" />
            {open && (
              <span className="word">
                {product.sense}<em>.</em>
              </span>
            )}
          </div>
          {open && (
            <div className="sb-ctx">
              <button onClick={() => nav('/', { state: { stage: 'product' } })} title="Zmień produkt">
                <span className="mono" style={{ letterSpacing: '.08em' }}>PD</span> <b>{product.name}</b>
              </button>
              <button onClick={() => nav('/', { state: { stage: 'ws' } })} title="Zmień workspace">
                <span className="mono" style={{ letterSpacing: '.08em' }}>WS</span> <b>{ws?.name}</b>
              </button>
              <button onClick={() => nav('/', { state: { stage: 'proj' } })} title="Zmień projekt">
                <span className="mono" style={{ letterSpacing: '.08em' }}>PR</span> <b>{proj?.name}</b>
              </button>
            </div>
          )}
        </div>
        <nav className="sb-nav">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`} title={it.label}>
              {it.icon}
              {open && <span className="lbl">{it.label}</span>}
            </NavLink>
          ))}
          <div className="sb-sep" />
          <NavLink to="/app/integrations" className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`} title="Integracje">
            <IcGlobe />
            {open && <span className="lbl">Integracje</span>}
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`} title="Ustawienia">
            <IcGear />
            {open && <span className="lbl">Ustawienia</span>}
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/app/admin" className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`} title="Admin">
              <IcShield />
              {open && <span className="lbl">Admin</span>}
            </NavLink>
          )}
        </nav>
        <div className="sb-bottom">
          <button className="sb-item" onClick={toggleTheme} title="Motyw">
            {theme === 'dark' ? <IcSun /> : <IcMoon />}
            {open && <span className="lbl">{theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}</span>}
          </button>
          <button className="sb-item" onClick={logout} title="Wyloguj">
            <IcLogout />
            {open && <span className="lbl">Wyloguj</span>}
          </button>
          <button className="sb-item" onClick={() => setOpen(!open)} title={open ? 'Zwiń' : 'Rozwiń'}>
            {open ? <IcChevL /> : <IcChevR />}
            {open && <span className="lbl">Zwiń menu</span>}
          </button>
        </div>
      </aside>
      <main className="main">
        <Suspense fallback={<SkelPage stats={4} cards={2} />}>
          <Routes>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="advisor" element={isAdvisor ? <Advisor /> : <Navigate to="../dashboard" replace />} />
            <Route path="sales" element={isSales ? <Sales /> : <Navigate to="../dashboard" replace />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="settings" element={<Settings />} />
            {user?.role === 'admin' && <Route path="admin" element={<AdminPanel />} />}
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
