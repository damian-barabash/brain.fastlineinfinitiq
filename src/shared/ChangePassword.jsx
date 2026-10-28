// Pierwsze logowanie po zakupie online (2026-10-28): hasło z maila jest jednorazowe,
// więc zanim klient zobaczy panel, ustawia własne. Pokazuje go Guard aplikacji,
// gdy `session.user.must_change_password` — także po odświeżeniu strony.
import { useState } from 'react'
import { api, session } from './platform.js'

export default function ChangePassword({ onDone }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const checks = [
    [a.length >= 8, 'co najmniej 8 znaków'],
    [/\d/.test(a), 'cyfra'],
    [/[a-ząćęłńóśźż]/.test(a) && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(a), 'mała i wielka litera'],
  ]

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (checks.some(([ok]) => !ok)) return setErr('Hasło jest za słabe — spełnij wszystkie trzy warunki.')
    if (a !== b) return setErr('Hasła się różnią.')
    setBusy(true)
    try {
      await api('users.setInitialPassword', { new_password: a })
      const u = session.patchUser({ must_change_password: false })
      onDone?.(u)
    } catch {
      setErr('Nie udało się zapisać hasła. Spróbuj ponownie.')
    }
    setBusy(false)
  }

  return (
    <div className="center-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="mono">
          <span className="dot" style={{ marginRight: 8 }} />
          Krok 1 z 2 · Bezpieczeństwo
        </div>
        <h1>Ustaw swoje hasło</h1>
        <p className="sub">
          Hasło z maila było jednorazowe. Wymyśl własne — będziesz się nim logować razem z adresem <b>{session.user?.login}</b>.
        </p>
        <label className="f">
          <span>Nowe hasło</span>
          <input type={show ? 'text' : 'password'} value={a} onChange={(e) => setA(e.target.value)} autoFocus autoComplete="new-password" />
        </label>
        <ul className="pw-checks">
          {checks.map(([ok, t]) => (
            <li key={t} className={ok ? 'ok' : ''}>{t}</li>
          ))}
        </ul>
        <label className="f">
          <span>Powtórz hasło</span>
          <input type={show ? 'text' : 'password'} value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="pw-show">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Pokaż hasło
        </label>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Zapisuję…' : 'Zapisz i przejdź dalej'}
        </button>
        {err && <p className="err">{err}</p>}
      </form>
    </div>
  )
}
