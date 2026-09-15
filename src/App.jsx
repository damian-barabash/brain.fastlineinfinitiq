import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { session } from './lib/api.js'
import Login from './pages/Login.jsx'
import Picker from './pages/Picker.jsx'
import Shell from './components/Shell.jsx'

const WidgetFrame = lazy(() => import('./pages/WidgetFrame.jsx'))
const Demo = lazy(() => import('./pages/Demo.jsx'))
const SalesDemo = lazy(() => import('./pages/SalesDemo.jsx'))
const Connect = lazy(() => import('./shared/Connect.jsx'))
const MetaCallback = lazy(() => import('./pages/MetaCallback.jsx'))

function Guard({ children, needProject }) {
  const loc = useLocation()
  if (!session.token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
