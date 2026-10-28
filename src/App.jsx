import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useState } from 'react'
import { session } from './lib/api.js'
import Login from './pages/Login.jsx'
import Picker from './pages/Picker.jsx'
import Shell from './components/Shell.jsx'

const WidgetFrame = lazy(() => import('./pages/WidgetFrame.jsx'))
const Demo = lazy(() => import('./pages/Demo.jsx'))
const SalesDemo = lazy(() => import('./pages/SalesDemo.jsx'))
const Connect = lazy(() => import('./shared/Connect.jsx'))
const MetaCallback = lazy(() => import('./pages/MetaCallback.jsx'))
const ChangePassword = lazy(() => import('./shared/ChangePassword.jsx'))

function Guard({ children, needProject }) {
  const loc = useLocation()
  const [, bump] = useState(0)
  if (!session.token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  // konto z zakupu online: hasło z maila jest jednorazowe — najpierw własne hasło
  if (session.user?.must_change_password) return <ChangePassword onDone={() => bump((n) => n + 1)} />
  if (needProject && (!session.ws || !session.proj)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/w" element={<WidgetFrame />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/sdemo" element={<SalesDemo />} />
        {/* publiczne zaproszenie do podłączenia kanałów (WhatsApp/Instagram/…) — wspólna strona platformy */}
        <Route path="/connect" element={<Connect product="AI Doradca · AI Sprzedawca" />} />
        <Route
          path="/"
          element={
            <Guard>
              <Picker />
            </Guard>
          }
        />
        {/* powrót z OAuth Facebooka — wybór strony; wymaga sesji i projektu */}
        <Route
          path="/meta/callback"
          element={
            <Guard needProject>
              <MetaCallback />
            </Guard>
          }
        />
        <Route
          path="/app/*"
          element={
            <Guard needProject>
              <Shell />
            </Guard>
          }
        />
        {/* linki z maili i z bramki płatności: /platnosci?paid=1 → zakładka w panelu */}
        <Route path="/platnosci" element={<Navigate to={`/app/platnosci${typeof location !== 'undefined' ? location.search : ''}`} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
