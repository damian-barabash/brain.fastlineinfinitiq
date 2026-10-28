// Prowadzenie za rękę po zakupie online (2026-10-28, Miro: strefa 4A).
//
// 1. ChannelGate — pełny ekran „Podłącz pierwszy kanał". Bez podłączonego kanału
//    (konto Unipile albo strona Facebooka / Instagram przez Meta) panel się nie otwiera.
// 2. StartGuide — kreator startu: pływająca lista kroków z paskiem postępu i
//    podpowiedź przypięta do konkretnego miejsca na ekranie (coach mark).
//    Kroki definiuje produkt (Brain → AI Doradca), stan żyje w `brain_users.onboarding`.
//
// Kogo dotyczy: tylko konta z zakupu online (`onboarding.started_at`). Konta zakładane
// przez nas ręcznie nie widzą ani bramki, ani kreatora.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, session } from './platform.js'
import { IcWhatsApp, IcInstagram, IcTelegram, IcCheck } from './Icons.jsx'

export const needsOnboarding = (u) => !!(u && u.role !== 'admin' && u.onboarding && u.onboarding.started_at)

async function saveOnb(patch) {
  const r = await api('onboarding.set', { patch })
  session.patchUser({ onboarding: r.onboarding })
  return r.onboarding
}

const GATE_PROVIDERS = [
  { key: 'WHATSAPP', label: 'WhatsApp', icon: IcWhatsApp, how: 'Zeskanujesz kod QR telefonem z numerem firmowym.' },
  { key: 'INSTAGRAM', label: 'Instagram', icon: IcInstagram, how: 'Zalogujesz się kontem firmowym (login i hasło Instagrama).' },
  { key: 'TELEGRAM', label: 'Telegram', icon: IcTelegram, how: 'Podasz numer telefonu i kod z Telegrama.' },
]

/** Czy projekt ma choć jeden działający kanał (Unipile albo Meta). */
export async function hasChannel(projectId) {
  const [a, c] = await Promise.all([
    api('accounts.list', { project_id: projectId }).catch(() => ({ accounts: [] })),
    api('channels.list', { project_id: projectId }).catch(() => ({ channels: [] })),
  ])
  const uni = (a.accounts ?? []).some((x) => x.status === 'OK')
  const meta = (c.channels ?? []).some((x) => ['facebook', 'instagram'].includes(x.type) && x.enabled && x.config?.oauth)
  return uni || meta
}

export function ChannelGate({ projectId, extra, onDone, helpUrl = 'https://fastlineinfinitiq.pl/kontakt' }) {
  const [waiting, setWaiting] = useState('')     // provider, na który czekamy
  const [err, setErr] = useState('')
  const [checking, setChecking] = useState(false)
  const timer = useRef(0)

  const check = useCallback(async () => {
    setChecking(true)
    const ok = await hasChannel(projectId)
    setChecking(false)
    if (ok) {
      clearInterval(timer.current)
      await saveOnb({ channel_done: true, channel_at: new Date().toISOString() }).catch(() => {})
      onDone?.()
    }
    return ok
  }, [projectId, onDone])

  useEffect(() => {
    check()
    return () => clearInterval(timer.current)
  }, [check])

  async function connect(p) {
    setErr('')
    // okno otwieramy od razu (w kliknięciu) — inaczej przeglądarka zablokuje popup
    const w = window.open('about:blank', '_blank')
    try {
      const d = await api('connect.create', { project_id: projectId, providers: [p.key], origin: window.location.origin })
      if (w) w.location.href = d.url
      else window.location.href = d.url
      setWaiting(p.key)
      clearInterval(timer.current)
      timer.current = setInterval(check, 4000)
    } catch (e) {
      if (w) w.close()
      setErr('Nie udało się przygotować podłączenia. Spróbuj ponownie albo napisz do nas.')
    }
  }

  return (
    <div className="onb-page">
      <div className="onb-card">
        <div className="mono"><span className="dot" style={{ marginRight: 8 }} />Krok 2 z 2 · Pierwszy kanał</div>
        <h1>Podłącz pierwszą sieć społecznościową</h1>
        <p className="sub">
          Tu Twój AI Doradca będzie odpowiadał klientom. Wybierz jeden kanał — kolejne dodasz później w zakładce „Integracje".
          Bez tego kroku doradca nie ma gdzie rozmawiać, dlatego panel otworzy się zaraz po podłączeniu.
        </p>

        <div className="onb-tiles">
          {GATE_PROVIDERS.map((p) => (
            <button key={p.key} type="button" className={'onb-tile' + (waiting === p.key ? ' on' : '')} onClick={() => connect(p)}>
              <p.icon />
              <b>{p.label}</b>
              <small>{p.how}</small>
            </button>
          ))}
        </div>
        {extra && <div className="onb-extra">{extra(check)}</div>}

        {waiting && (
          <div className="onb-wait">
            <span className="kb-spin" /> Czekamy na podłączenie w nowej karcie… Po zalogowaniu wróć tutaj — sprawdzamy co kilka sekund.
            <button type="button" className="btn" onClick={check} disabled={checking}>{checking ? 'Sprawdzam…' : 'Już podłączyłem'}</button>
          </div>
        )}
        {err && <p className="err">{err}</p>}
        <p className="onb-help">
          Utknąłeś? <a href={helpUrl} target="_blank" rel="noopener">Umów 15 minut z opiekunem</a> — podłączymy razem.
        </p>
      </div>
    </div>
  )
}

/* ── Kreator startu ─────────────────────────────────────────────────────────
   steps: [{ key, title, text, path, target, done?: async () => bool }]
   `target` = selektor CSS miejsca, które podświetlamy; brak = karta na środku. */

export function StartGuide({ steps, user }) {
  const nav = useNavigate()
  const loc = useLocation()
  const [onb, setOnb] = useState(user?.onboarding ?? {})
  const [open, setOpen] = useState(!user?.onboarding?.guide_min)
  const [tip, setTip] = useState(null)          // aktywny krok z podpowiedzią
  const [rect, setRect] = useState(null)
  const done = onb.steps ?? {}
  const total = steps.length
  const count = steps.filter((s) => done[s.key]).length
  const current = steps.find((s) => !done[s.key])
  // kroki przychodzą z rodzica świeże przy każdym renderze — porównujemy po kluczu, nie po obiekcie
  const idx = tip ? steps.findIndex((s) => s.key === tip.key) : -1

  // kroki, które da się sprawdzić same (np. baza wiedzy ma wpis) — odhaczamy po cichu
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const s of steps) {
        if (done[s.key] || !s.done) continue
        const ok = await s.done().catch(() => false)
        if (ok && alive) await mark(s.key)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname])

  async function mark(key) {
    const next = await saveOnb({ steps: { ...(session.user?.onboarding?.steps ?? {}), [key]: new Date().toISOString() } })
    setOnb(next)
    if (steps.every((s) => next.steps?.[s.key])) {
      const fin = await saveOnb({ finished_at: new Date().toISOString() })
      setOnb(fin)
    }
  }

  function go(s) {
    setTip(s)
    if (!s.path) return
    const [p, qs] = s.path.split('?')
    if (loc.pathname !== p || (qs && !loc.search.includes(qs))) nav(s.path)
  }

  // pozycja podświetlenia — szukamy celu, aż się wyrenderuje
  useLayoutEffect(() => {
    if (!tip || !tip.target) { setRect(null); return undefined }
    let n = 0, t = 0
    const find = () => {
      const el = document.querySelector(tip.target)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setTimeout(() => setRect(el.getBoundingClientRect()), 350)
      } else if (n++ < 20) t = setTimeout(find, 150)
      else setRect(null)
    }
    find()
    const re = () => { const el = document.querySelector(tip.target); if (el) setRect(el.getBoundingClientRect()) }
    addEventListener('resize', re)
    addEventListener('scroll', re, true)
    return () => { clearTimeout(t); removeEventListener('resize', re); removeEventListener('scroll', re, true) }
  }, [tip?.key, loc.pathname, loc.search]) // eslint-disable-line react-hooks/exhaustive-deps

  if (onb.finished_at && !tip) return null

  const minimize = (v) => { setOpen(!v); saveOnb({ guide_min: v }).catch(() => {}) }

  return (
    <>
      {tip && (
        <div className="onb-coach" onClick={(e) => { if (e.target === e.currentTarget) setTip(null) }}>
          {rect && (
            <div className="onb-hole" style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }} />
          )}
          <div className="onb-pop" style={popPos(rect)}>
            <div className="mono">Krok {idx + 1} z {total}</div>
            <b>{tip.title}</b>
            <p>{tip.text}</p>
            <div className="btn-group">
              <button className="btn primary" onClick={async () => { await mark(tip.key); const nx = steps[idx + 1]; if (nx) go(nx); else setTip(null) }}>
                {idx + 1 === total ? 'Zakończ' : 'Gotowe, dalej'}
              </button>
              <button className="btn" onClick={() => setTip(null)}>Zrobię to sam</button>
            </div>
          </div>
        </div>
      )}

      {!onb.finished_at && (
        <aside className={'onb-dock' + (open ? '' : ' min')}>
          <button type="button" className="onb-dock-h" onClick={() => minimize(open)}>
            <span>Kreator startu</span>
            <b>{count}/{total}</b>
          </button>
          <div className="onb-bar"><i style={{ width: `${(count / total) * 100}%` }} /></div>
          {open && (
            <>
              <ol className="onb-steps">
                {steps.map((s) => (
                  <li key={s.key} className={(done[s.key] ? 'done' : '') + (current && current.key === s.key ? ' now' : '')}>
                    <button type="button" onClick={() => go(s)}>
                      <span className="n">{done[s.key] ? <IcCheck /> : steps.findIndex((x) => x.key === s.key) + 1}</span>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ol>
              {current && <button className="btn primary onb-next" onClick={() => go(current)}>Pokaż: {current.title.toLowerCase()}</button>}
            </>
          )}
        </aside>
      )}
    </>
  )
}

function popPos(r) {
  if (!r) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const W = 340, vw = window.innerWidth, vh = window.innerHeight
  if (vw < 640) return { left: 12, right: 12, bottom: 12 }
  const below = r.bottom + 16 + 200 < vh
  const left = Math.max(12, Math.min(vw - W - 12, r.left))
  return below ? { top: r.bottom + 16, left, width: W } : { top: Math.max(12, r.top - 16 - 210), left, width: W }
}
