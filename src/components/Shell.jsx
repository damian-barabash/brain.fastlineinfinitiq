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
import UserBadge from '../shared/UserBadge.jsx'
import { refreshMe, installBusyUi } from '../shared/platform.js'

const Dashboard = lazy(() => import('../pages/Dashboard.jsx'))
const Advisor = lazy(() => import('../pages/Advisor.jsx'))
const Sales = lazy(() => import('../pages/Sales.jsx'))
const Knowledge = lazy(() => import('../pages/Knowledge.jsx'))
const Settings = lazy(() => import('../pages/Settings.jsx'))
const Integrations = lazy(() => import('../pages/Integrations.jsx'))
const AdminPanel = lazy(() => import('../pages/AdminPanel.jsx'))
const Payments = lazy(() => import('../shared/Payments.jsx'))
import { ChannelGate, StartGuide, needsOnboarding } from '../shared/Onboarding.jsx'
import MetaConnect from './MetaConnect.jsx'
import { IcCard } from '../shared/Icons.jsx'

export default function Shell() {
  const nav = useNavigate()
  const [open, setOpen] = useState(window.innerWidth > 900)
  const [theme, setThemeState] = useState(getTheme())
  const user = session.user
  const [me, setMe] = useState(user)
  useEffect(() => {
    installBusyUi()
    let alive = true
    refreshMe().then((u) => alive && u && setMe({ ...(session.user || {}), ...u }))
    return () => {
      alive = false
    }
  }, [])
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
    // chwilę później: dane otwartej strony mają wyjść do bramki pierwsze
    const t = setTimeout(() => {
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
    }, 1200)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // prefetch: chunki stron + dane wszystkich sekcji — nawigacja bez czekania
  useEffect(() => {
    let alive = true
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300))
    idle(() => {
      import('../pages/Dashboard.jsx')
      if (isAdvisor) import('../pages/Advisor.jsx')
      if (isSales) import('../pages/Sales.jsx')
      import('../pages/Knowledge.jsx')
      import('../pages/Settings.jsx')
      import('../pages/Integrations.jsx')
      if (user?.role === 'admin') import('../pages/AdminPanel.jsx')
    })
    // Dane sekcji podgrzewamy PO KOLEI i z opóźnieniem: równoległa salwa żądań
    // na wolnym łączu (albo przy spowolnionej bramce) opóźniała dane strony,
    // którą użytkownik właśnie otworzył. Kolejność = najczęściej odwiedzane.
    const jobs = [
      ['stats', { project_id: proj.id, days: 30, channel_type: undefined }],
      ['kb.list', { project_id: proj.id }],
      ['channels.list', { project_id: proj.id }],
    ]
    if (isAdvisor) jobs.push(['advisor.get', { project_id: proj.id }])
    if (isSales) jobs.push(['sales.get', { project_id: proj.id }], ['leads.list', { project_id: proj.id }])
    const t = setTimeout(async () => {
      for (const [a, p] of jobs) {
        if (!alive) return
        await warm(a, p)
      }
    }, 2500)
    return () => {
      alive = false
      clearTimeout(t)
    }
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

  // Zakup online → prowadzenie za rękę (Miro 4A). Najpierw obowiązkowy kanał —
  // bez niego panel się nie otwiera; potem kreator startu na żywych ekranach.
  const onb = needsOnboarding(me) && isAdvisor
  const [gateOk, setGateOk] = useState(() => !!session.user?.onboarding?.channel_done)
  if (onb && !gateOk && !me?.onboarding?.channel_done) {
    return (
      <ChannelGate
        projectId={proj.id}
        extra={(recheck) => (
          <details className="onb-more">
            <summary>Messenger strony firmowej albo Instagram Business — przez Facebooka</summary>
            <MetaConnect projectId={proj.id} onChange={recheck} />
          </details>
        )}
        onDone={() => setGateOk(true)}
      />
    )
  }
  const guideSteps = [
    { key: 'kb', title: 'Wiedza o firmie', path: '/app/knowledge', target: '[data-tour="kb-add"]',
      text: 'Kliknij „Dodaj wiedzę" i wklej adres swojej strony WWW — doradca sam przeczyta ofertę, ceny i FAQ. Możesz też dodać plik albo tekst.',
      done: async () => ((await api('kb.list', { project_id: proj.id }))?.items ?? []).length > 0 },
    { key: 'archetype', title: 'Osobowość doradcy', path: '/app/advisor?tab=archetype', target: '[data-tour="adv-archetype"]',
      text: 'Nadaj doradcy imię, wybierz ton i napisz powitanie. To pierwsze zdanie, które zobaczy Twój klient. Zapisz zmiany przyciskiem pod formularzem.' },
    { key: 'test', title: 'Rozmowa próbna', path: '/app/advisor?tab=test', target: '[data-tour="adv-test"]',
      text: 'Napisz kilka pytań jak klient: o cenę, termin, wybór wariantu. Jeśli odpowiedź jest zła — popraw ją kciukiem, doradca zapamięta uwagę.' },
    { key: 'start', title: 'Start na stronie', path: '/app/integrations', target: '[data-tour="int-widget"]',
      text: 'Doradca już odpowiada w podłączonym kanale. Skopiuj kod widgetu i wklej go na swojej stronie (albo wyślij informatykowi) — wtedy rozmawia też na WWW.' },
  ]

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
          <NavLink to="/app/platnosci" className={({ isActive }) => `sb-item ${isActive ? 'on' : ''}`} title="Płatności">
            <IcCard />
            {open && <span className="lbl">Płatności</span>}
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
      <main className="main has-topbar">
        {/* kto jest zalogowany — zawsze w prawym górnym rogu, w każdym produkcie platformy */}
        <div className="topbar">
          <UserBadge user={me} />
        </div>
        {me?.billing_blocked && (
          <div className="pay-debt" style={{ marginBottom: 18 }}>
            <div>
              <b>AI Doradca wstrzymany — zaległa płatność</b>
              <span>Dane i ustawienia są bezpieczne. Po opłaceniu faktury doradca wraca od razu.</span>
            </div>
            <NavLink className="btn primary" to="/app/platnosci">Przejdź do płatności</NavLink>
          </div>
        )}
        {onb && <StartGuide steps={guideSteps} user={me} />}
        <Suspense fallback={<SkelPage stats={4} cards={2} />}>
          <Routes>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="advisor" element={isAdvisor ? <Advisor /> : <Navigate to="../dashboard" replace />} />
            <Route path="sales" element={isSales ? <Sales /> : <Navigate to="../dashboard" replace />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="integrations" element={<Integrations />} />
            <Route path="settings" element={<Settings />} />
            <Route path="platnosci" element={<Payments />} />
            {user?.role === 'admin' && <Route path="admin" element={<AdminPanel />} />}
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
