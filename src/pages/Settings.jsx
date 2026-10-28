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
      <div style={{ maxWidth: 860 }}>
        <div className="sec-h">Wygląd</div>
        <div className="srows">
          <div className="srow">
            <div className="sl">
              <b>Motyw panelu</b>
              <small>Zapamiętujemy go w tej przeglądarce.</small>
            </div>
            <div className="sv">
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
          </div>
        </div>

        <div className="sec-h">Konto</div>
        <div className="srows">
          <div className="srow">
            <div className="sl"><b>Login</b></div>
            <div className="sv"><span className="ell">{user?.login}</span></div>
          </div>
          <div className="srow">
            <div className="sl"><b>Obecne hasło</b></div>
            <div className="sv">
              <input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} autoComplete="current-password" aria-label="Obecne hasło" />
            </div>
          </div>
          <div className="srow">
            <div className="sl">
              <b>Nowe hasło</b>
              <small>Minimum 6 znaków.</small>
            </div>
            <div className="sv">
              <input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} autoComplete="new-password" aria-label="Nowe hasło" />
            </div>
          </div>
          <div className="srow">
            <div className="sl">
              {msg && (
                <span className={`badge ${msg.ok ? 'ok' : 'danger'}`}>
                  {msg.ok && <IcCheck style={{ width: 11, height: 11 }} />} {msg.text}
                </span>
              )}
            </div>
            <div className="sv">
              <button className="btn primary" onClick={changePass} disabled={!oldP || !newP}>
                Zmień hasło
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
