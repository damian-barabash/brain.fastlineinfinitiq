// Powrót z okna Facebooka (/meta/callback?code=…&state=…): wymiana kodu na tokeny stron
// (po stronie brain-admin), wybór strony i podłączenie. Sesja panelu wymagana — Guard w App.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, session } from '../lib/api.js'
import { IcFacebook, IcInstagram, IcCheck } from '../components/Icons.jsx'
import { SkelPage } from '../shared/Skeleton.jsx'

export default function MetaCallback() {
  const nav = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code') || ''
  const state = params.get('state') || ''
  const fbErr = params.get('error_description') || params.get('error') || ''

  const [res, setRes] = useState(null)
  const [err, setErr] = useState(fbErr ? `Facebook: ${fbErr}` : '')
  const [chosen, setChosen] = useState(null)
  const [withIg, setWithIg] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (fbErr || !code) return
    api('meta.oauth.exchange', { code, state, origin: window.location.origin })
      .then((d) => {
        setRes(d)
        const first = (d.pages ?? []).find((p) => p.can !== false) ?? d.pages?.[0]
        if (first) setChosen(first.id)
        // usuwamy code z adresu, żeby odświeżenie nie próbowało wymienić go drugi raz
        window.history.replaceState(null, '', '/meta/callback')
      })
      .catch((e) => setErr(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    if (!chosen) return
    setBusy(true)
    setErr('')
    try {
      const d = await api('meta.connect', { project_id: res.project_id, page_id: chosen, with_instagram: withIg })
      setDone(d)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const page = res?.pages?.find((p) => p.id === chosen)
  const corner = { position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid' }

  return (
    <div className="center-page" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="auth-card" style={{ maxWidth: 560, textAlign: 'left' }} data-meta-callback>
        <span style={{ ...corner, borderWidth: '2px 0 0 2px', top: -1, left: -1 }} />
        <span style={{ ...corner, borderWidth: '0 2px 2px 0', bottom: -1, right: -1 }} />
        <div className="mono">
          <span className="dot" style={{ marginRight: 8 }} />
          {session.proj?.name || 'Projekt'} // Facebook
        </div>

        {err && (
          <>
            <h1 style={{ marginTop: 10 }}>Nie udało się</h1>
            <p className="err" style={{ marginTop: 8 }}>{err}</p>
            <button className="btn" style={{ marginTop: 16 }} onClick={() => nav('/app/integrations')}>Wróć do Integracji</button>
          </>
        )}

        {!err && !res && !done && (
          <>
            <h1 style={{ marginTop: 10 }}>Łączę z <span style={{ color: 'var(--acid)' }}>Facebookiem</span>…</h1>
            <SkelPage head={false} cards={1} />
          </>
        )}

        {!err && res && !done && (
          <>
            <h1 style={{ marginTop: 10 }}>Wybierz <span style={{ color: 'var(--acid)' }}>stronę</span></h1>
            <p className="sub">Zalogowano jako {res.user}. Doradca będzie odpowiadał w Messengerze wybranej strony.</p>
            {res.pages.length === 0 && (
              <div className="note warn" style={{ marginTop: 14 }}>
                Facebook nie zwrócił żadnej strony. Upewnij się, że w oknie Facebooka zaznaczyłeś stronę (opcja „Wybierz, do czego aplikacja ma dostęp") i że masz do niej rolę administratora.
              </div>
            )}
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }} data-meta-pages>
              {res.pages.map((p) => (
                <label key={p.id} className={'int-row' + (chosen === p.id ? ' on' : '')} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 10, alignItems: 'center', cursor: 'pointer', border: chosen === p.id ? '1px solid var(--acid)' : '1px solid var(--line)', padding: '10px 12px' }}>
                  <input type="radio" name="page" checked={chosen === p.id} onChange={() => setChosen(p.id)} style={{ width: 16, height: 16 }} />
                  <IcFacebook style={{ width: 16, height: 16, color: 'var(--acid)' }} />
                  <span>
                    <b>{p.name}</b>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)', display: 'block' }}>
                      {p.id}{p.ig ? ` · Instagram @${p.ig.username || p.ig.id}` : ' · bez konta Instagram'}{p.can === false ? ' · brak uprawnień do wiadomości' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {page?.ig && (
              <label className="row" style={{ gap: 10, marginTop: 14, alignItems: 'center' }}>
                <input type="checkbox" checked={withIg} onChange={(e) => setWithIg(e.target.checked)} style={{ width: 16, height: 16 }} />
                <IcInstagram style={{ width: 15, height: 15, color: 'var(--acid)' }} />
                <span>Podłącz też Instagram @{page.ig.username || page.ig.id} (wiadomości Direct)</span>
              </label>
            )}
            <div className="row" style={{ gap: 8, marginTop: 18 }}>
              <button className="btn primary" onClick={connect} disabled={!chosen || busy || page?.can === false} data-meta-confirm>
                {busy ? 'Podłączam…' : 'Podłącz'}
              </button>
              <button className="btn" onClick={() => nav('/app/integrations')} disabled={busy}>Anuluj</button>
            </div>
          </>
        )}

        {done && (
          <>
            <h1 style={{ marginTop: 10 }}>Strona <span style={{ color: 'var(--acid)' }}>podłączona</span></h1>
            <div className="note" style={{ marginTop: 14 }}>
              <div className="row" style={{ gap: 8 }}>
                <IcCheck style={{ width: 14, height: 14, color: 'var(--acid)', flexShrink: 0 }} />
                <span>Messenger{done.instagram ? ' i Instagram' : ''} — doradca odpowiada od teraz. Webhook strony zasubskrybowany automatycznie.</span>
              </div>
            </div>
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => nav('/app/integrations')}>Do Integracji</button>
          </>
        )}
      </div>
    </div>
  )
}
