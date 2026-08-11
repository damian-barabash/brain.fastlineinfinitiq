// Ustawienia użytkownika: motyw + zmiana hasła.
import { useState } from 'react'
import { api, session, getTheme, setTheme } from '../lib/api.js'
import { IcSun, IcMoon, IcCheck } from '../components/Icons.jsx'

export default function Settings() {
  const [theme, setThemeState] = useState(getTheme())
  const [oldP, setOldP] = useState('')
  const [newP, setNewP] = useState('')
  const [msg, setMsg] = useState(null)
  const user = session.user

  function pick(t) {
    setTheme(t)
    setThemeState(t)
  }

  async function changePass() {
    setMsg(null)
    try {
      await api('users.password', { old_password: oldP, new_password: newP })
      setMsg({ ok: true, text: 'Hasło zmienione.' })
      setOldP('')
      setNewP('')
    } catch (e) {
      setMsg({ ok: false, text: e.message === 'invalid' ? 'Stare hasło nieprawidłowe.' : 'Hasło min. 6 znaków.' })
    }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {user?.login}
          </div>
          <h1>Ustawienia</h1>
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>Motyw panelu</h3>
          <div className="chips">
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => pick('dark')}>
              <IcMoon style={{ width: 13, height: 13, marginRight: 6, verticalAlign: '-2px' }} />
              Ciemny
            </button>
            <button className={theme === 'light' ? 'on' : ''} onClick={() => pick('light')}>
              <IcSun style={{ width: 13, height: 13, marginRight: 6, verticalAlign: '-2px' }} />
              Jasny
            </button>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 14 }}>Zmiana hasła</h3>
          <label className="f">
            <span className="mono">Obecne hasło</span>
            <input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="f">
            <span className="mono">Nowe hasło (min. 6 znaków)</span>
            <input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} autoComplete="new-password" />
          </label>
          <div className="row">
            <button className="btn primary" onClick={changePass} disabled={!oldP || !newP}>
              Zmień hasło
            </button>
            {msg && (
              <span className={`badge ${msg.ok ? 'ok' : 'danger'}`}>
                {msg.ok && <IcCheck style={{ width: 11, height: 11 }} />} {msg.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
