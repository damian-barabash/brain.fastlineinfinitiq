// Publiczna strona demo sprzedawcy (/sdemo?key=…) — do wysłania klientowi.
// Odbiorca gra klienta: AI pisze pierwszy (jak do leada), rozmowa symulowana, nic nie zapisuje się w bazie.
import { useEffect, useState } from 'react'
import { salesHello } from '../lib/api.js'
import SalesChat from '../components/SalesChat.jsx'

export default function SalesDemo() {
  const q = new URLSearchParams(window.location.search)
  const key = q.get('key') || ''
  const [hello, setHello] = useState(null)

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    if (key) salesHello(key).then(setHello).catch(() => setHello({ error: true }))
  }, [key])

  if (!key) {
    return (
      <div className="center-page">
        <p className="muted">Brak klucza w linku.</p>
      </div>
    )
  }

  return (
    <div className="center-page" style={{ alignItems: 'stretch', padding: '28px 16px', gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div
        className="auth-card demo-card"
        style={{ maxWidth: 580, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', padding: 0, height: 'calc(100vh - 56px)', maxHeight: 780 }}
      >
        <span style={{ position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid', borderWidth: '2px 0 0 2px', top: -1, left: -1 }} />
        <span style={{ position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid', borderWidth: '0 2px 2px 0', bottom: -1, right: -1 }} />
        <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <span className="dot" />
          <div>
            <b style={{ fontFamily: 'Space Grotesk, sans-serif', textTransform: 'uppercase', fontSize: 14, letterSpacing: '.02em', display: 'block' }}>
              {hello?.persona || 'AI Sprzedawca'}
            </b>
            {hello?.project && (
              <span className="mono" style={{ fontSize: 9.5 }}>
                {hello.project}
              </span>
            )}
          </div>
          <span className="badge acid right">Demo — Sprzedawca</span>
        </div>
        {hello?.error ? (
          <div className="chat-msgs">
            <div className="msg ai">Ten link demo jest nieaktywny.</div>
          </div>
        ) : (
          <SalesChat demoKey={key} storeKey={`brain_sdemo:${key.slice(0, 10)}`} autoFocus />
        )}
        <div className="mono" style={{ textAlign: 'center', padding: '7px 0 10px', fontSize: 9 }}>
          powered by Fastline InfinitiQ // Brain
        </div>
      </div>
    </div>
  )
}
