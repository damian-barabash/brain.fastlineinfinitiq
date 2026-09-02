// Ekran logowania jest jeden dla całej platformy — produkt podmienia tylko nazwę
// i jedno zdanie opisu. Po zalogowaniu zawsze idziemy na wybór produktu ("/").
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, session } from './platform.js'

export default function Login({ product = 'Brain', tagline = 'Cyfrowi pracownicy. Zaloguj się, aby kontynuować.' }) {
  const nav = useNavigate()
  const [login, setLogin] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const { token, user } = await api('login', { login, password: pass })
      session.login(token, user)
      nav('/', { replace: true })
    } catch {
      setErr('Nieprawidłowy login lub hasło.')
    } finally {
      setBusy(false)
    }
  }

  const corner = { position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid' }
  return (
    <div className="center-page">
      <form className="auth-card" onSubmit={submit}>
        <span style={{ ...corner, borderWidth: '2px 0 0 2px', top: -1, left: -1 }} />
        <span style={{ ...corner, borderWidth: '0 2px 2px 0', bottom: -1, right: -1 }} />
        <div className="mono">
          <span className="dot" style={{ marginRight: 8 }} />
          Fastline InfinitiQ // {product}
        </div>
        <h1>
          Panel <span style={{ color: 'var(--acid)' }}>{product}</span>
        </h1>
        <p className="sub">{tagline}</p>
        <label className="f">
          <span className="mono">Login</span>
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label className="f">
          <span className="mono">Hasło</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Logowanie…' : 'Zaloguj się'}
        </button>
        {err && <p className="err">{err}</p>}
      </form>
    </div>
  )
}
