// Publiczna strona zaproszenia `/connect?t=…` — ta sama w każdej domenie produktu.
// Klient dostaje od nas link i podłącza swoje kanały (WhatsApp / Instagram / LinkedIn /
// Messenger / Telegram) sam. Hasła nie wpisuje u nas — kreator Unipile otwiera się na
// ich domenie, a do nas wraca tylko potwierdzenie (webhook), które przypisuje konto
// do projektu. Strona jest poza bramką logowania: wszystko autoryzuje token z adresu.
import { useCallback, useEffect, useState } from 'react'
import { FN_BASE } from './platform.js'
import { IcCheck, IcShield, IcGlobe, IcLink, IcWhatsApp, IcInstagram, IcLinkedIn, IcFacebook, IcTelegram } from './Icons.jsx'

const ICON = { WHATSAPP: IcWhatsApp, INSTAGRAM: IcInstagram, LINKEDIN: IcLinkedIn, MESSENGER: IcFacebook, TELEGRAM: IcTelegram }
const HOW = {
  WHATSAPP: 'zeskanujesz kod QR telefonem z numerem FIRMOWYM (zwykły WhatsApp albo WhatsApp Business) — dokładnie jak przy WhatsApp Web',
  INSTAGRAM: 'zalogujesz się loginem i hasłem konta FIRMOWEGO (nie „przez Facebooka” — jeśli konto nie ma własnego hasła, ustaw je w Instagramie: Centrum kont → Hasło); przy 2FA podasz kod',
  LINKEDIN: 'zalogujesz się na swój profil (na LinkedInie piszą ludzie, nie strony) i potwierdzisz logowanie w aplikacji',
  MESSENGER: 'zalogujesz się do Facebooka — podłącza to Twoją PRYWATNĄ skrzynkę Messengera, nie stronę firmową (stronę podłącza opiekun przez aplikację Meta)',
  TELEGRAM: 'podasz numer telefonu (firmowy) i kod z Telegrama',
}

async function call(action, t) {
  const r = await fetch(`${FN_BASE}/brain-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, t }),
  })
  return await r.json().catch(() => ({ ok: false }))
}

const BAD = {
  none: ['Ten link jest nieaktywny', 'Poproś swojego opiekuna z Fastline InfinitiQ o nowy — stary mógł zostać unieważniony.'],
  revoked: ['Link został unieważniony', 'Poproś swojego opiekuna z Fastline InfinitiQ o nowy link.'],
  expired: ['Link stracił ważność', 'Poproś swojego opiekuna z Fastline InfinitiQ o nowy — wystawienie zajmuje chwilę.'],
}

export default function Connect({ product = 'Fastline InfinitiQ', tagline = 'Dzięki temu agent AI może rozmawiać z Twoimi klientami w Twoim imieniu.' }) {
  const params = new URLSearchParams(window.location.search)
  const t = params.get('t') || ''
  const back = params.get('ok') === '1' ? 'ok' : params.get('fail') === '1' ? 'fail' : ''

  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [seenAccounts, setSeenAccounts] = useState(-1)

  const load = useCallback(async () => {
    if (!t) {
      setInfo({ ok: false, state: 'none' })
      return null
    }
    const d = await call('connect.info', t)
    setInfo(d)
    return d
  }, [t])

  useEffect(() => {
    load().then((d) => setSeenAccounts(d?.accounts?.length ?? 0))
  }, [load])

  // Po powrocie z kreatora webhook Unipile bywa o kilka sekund spóźniony —
  // odpytujemy, aż pojawi się nowe konto (albo minie minuta).
  useEffect(() => {
    if (back !== 'ok' || seenAccounts < 0) return undefined
    let n = 0
    const id = setInterval(async () => {
      n += 1
      const d = await load()
      if ((d?.accounts?.length ?? 0) > seenAccounts || n > 20) clearInterval(id)
    }, 3000)
    return () => clearInterval(id)
  }, [back, seenAccounts, load])

  async function start() {
    setBusy(true)
    setErr('')
    const d = await call('connect.start', t)
    if (d?.url) {
      window.location.href = d.url
      return
    }
    setBusy(false)
    setErr(d?.error || 'Nie udało się otworzyć kreatora. Spróbuj ponownie za chwilę.')
    if (d?.state) setInfo((p) => ({ ...(p ?? {}), ...d }))
  }

  const corner = { position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid' }
  const state = info?.state
  const bad = !info?.ok && BAD[state ?? 'none']
  const providers = info?.providers ?? []
  const accounts = info?.accounts ?? []
  const reconnect = info?.kind === 'reconnect'
  const done = reconnect ? state === 'connected' : accounts.length > 0
  const justConnected = back === 'ok' && accounts.length > Math.max(seenAccounts, 0)
  const single = providers.length === 1 ? providers[0] : null
  const SingleIcon = single ? ICON[single.key] ?? IcLink : IcLink

  return (
    <div className="center-page" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
      <div className="auth-card" style={{ maxWidth: 540, textAlign: 'left' }}>
        <span style={{ ...corner, borderWidth: '2px 0 0 2px', top: -1, left: -1 }} />
        <span style={{ ...corner, borderWidth: '0 2px 2px 0', bottom: -1, right: -1 }} />

        <div className="mono">
          <span className="dot" style={{ marginRight: 8 }} />
          Fastline InfinitiQ // {product}
        </div>

        {info === null && <p className="sub" style={{ marginTop: 18 }}>Sprawdzam link…</p>}

        {bad && (
          <>
            <h1 style={{ marginTop: 10 }}>{bad[0]}</h1>
            <p className="sub">{bad[1]}</p>
          </>
        )}

        {info?.ok && (
          <>
            <h1 style={{ marginTop: 10 }}>
              {done && reconnect ? (
                <>Konto <span style={{ color: 'var(--acid)' }}>podłączone ponownie</span></>
              ) : justConnected ? (
                <>Kanał <span style={{ color: 'var(--acid)' }}>podłączony</span></>
              ) : single ? (
                <>Podłącz swój <span style={{ color: 'var(--acid)' }}>{single.label}</span></>
              ) : (
                <>Podłącz swoje <span style={{ color: 'var(--acid)' }}>kanały</span></>
              )}
            </h1>
            <p className="sub">
              {reconnect
                ? 'Dostawca poprosił o ponowne zalogowanie. Jedno kliknięcie i agent wraca do pracy.'
                : tagline}
              {info.project ? ` Projekt: ${info.project}.` : ''}
            </p>

            {accounts.length > 0 && (
              <div className="note" style={{ marginTop: 14 }} data-connected>
                {accounts.map((a, i) => {
                  const Icon = ICON[a.provider] ?? IcCheck
                  return (
                    <div className="row" key={i} style={{ gap: 8, marginBottom: i < accounts.length - 1 ? 6 : 0 }}>
                      <Icon style={{ width: 14, height: 14, color: 'var(--acid)', flexShrink: 0 }} />
                      <span>
                        <b>{a.label}</b>
                        {a.name ? ` · ${a.name}` : ''} — podłączone
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {!done || (!reconnect && !justConnected) ? (
              <>
                {!reconnect && providers.length > 0 && (
                  <ul style={{ margin: '16px 0 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }} data-providers>
                    {providers.map((p) => {
                      const Icon = ICON[p.key] ?? IcLink
                      const has = accounts.some((a) => a.provider === p.key)
                      return (
                        <li key={p.key} className="row" style={{ gap: 9, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                          <Icon style={{ width: 15, height: 15, color: has ? 'var(--acid)' : 'var(--dim)', flexShrink: 0, marginTop: 2 }} />
                          <span>
                            <b>{p.label}</b>
                            {has ? <span className="badge acid" style={{ marginLeft: 8 }}>podłączony</span> : null}
                            <div className="muted" style={{ fontSize: 12.5 }}>{HOW[p.key]}</div>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="note" style={{ marginTop: 16, marginBottom: 18 }}>
                  <div className="row" style={{ gap: 9, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <IcShield style={{ width: 15, height: 15, color: 'var(--acid)', flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <b>Hasła nie podajesz nam.</b> Logujesz się na stronie naszego dostawcy (Unipile) — obsługuje
                      też kod 2FA i potwierdzenie w aplikacji. My dostajemy wyłącznie potwierdzenie, że konto jest
                      połączone. Połączenie możesz w każdej chwili cofnąć u swojego opiekuna.
                    </span>
                  </div>
                </div>

                {back === 'fail' && (
                  <p className="err" style={{ marginBottom: 12 }}>
                    Logowanie nie doszło do skutku. Spróbuj jeszcze raz — najczęściej wystarczy potwierdzić logowanie
                    w aplikacji albo zeskanować kod ponownie.
                  </p>
                )}
                {back === 'ok' && !justConnected && (
                  <p className="sub" style={{ marginBottom: 12 }}>Kończymy podłączanie… Ten ekran odświeży się sam.</p>
                )}

                <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={start} disabled={busy} data-connect-start>
                  <SingleIcon style={{ width: 16, height: 16 }} />
                  {busy
                    ? 'Otwieram kreator…'
                    : reconnect
                    ? 'Podłącz ponownie'
                    : accounts.length
                    ? 'Podłącz kolejny kanał'
                    : single
                    ? `Połącz konto ${single.label}`
                    : 'Połącz konto'}
                </button>
                {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
              </>
            ) : (
              <>
                <div className="note" style={{ marginTop: 16 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <IcCheck style={{ width: 14, height: 14, color: 'var(--acid)', flexShrink: 0 }} />
                    Gotowe. Nie musisz nic więcej robić — możesz zamknąć tę stronę.
                  </span>
                </div>
                {!reconnect && providers.length > accounts.length && (
                  <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={start} disabled={busy} data-connect-more>
                    <IcLink style={{ width: 15, height: 15 }} /> {busy ? 'Otwieram kreator…' : 'Podłącz kolejny kanał'}
                  </button>
                )}
              </>
            )}
          </>
        )}

        <div className="row" style={{ marginTop: 22, gap: 7, color: 'var(--dim2)' }}>
          <IcGlobe style={{ width: 13, height: 13, flexShrink: 0 }} />
          <span className="mono" style={{ fontSize: 10.5 }}>fastlineinfinitiq.pl</span>
        </div>
      </div>
    </div>
  )
}
