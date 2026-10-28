// Zakładka „Płatności" (2026-10-28) — wspólna dla wszystkich produktów platformy.
// Abonament jest cykliczny: co miesiąc edge `billing` wystawia fakturę i obciąża
// zapisaną kartę. Nieudana płatność = zaległość: baner + „Zapłać teraz";
// po 7 dniach doradca jest wstrzymany, po 14 subskrypcja anulowana (mail dzień 0/3/5).
import { useCallback, useEffect, useState } from 'react'
import { postEdge, session } from './platform.js'
import Invoices from './Invoices.jsx'

async function billing(action, payload = {}) {
  const r = await postEdge('billing', { action, token: session.token, ...payload }, { read: action === 'account.get' })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

const zl = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
const day = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const STATUS = {
  active: ['ok', 'Aktywna'],
  past_due: ['warn', 'Zaległa płatność'],
  paused: ['danger', 'Wstrzymana — zaległość'],
  canceled: ['', 'Anulowana'],
}

export default function Payments() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const q = new URLSearchParams(location.search)

  const load = useCallback(() => billing('account.get').then(setD).catch((e) => setErr(e.message)), [])
  useEffect(() => {
    load()
    if (q.get('paid')) setMsg({ ok: true, text: 'Dziękujemy — płatność przyjęta.' })
    if (q.get('failed')) setMsg({ ok: false, text: 'Płatność nie przeszła. Spróbuj jeszcze raz albo użyj innej karty.' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pay() {
    const r = await billing('account.pay')
    if (r.redirect) location.href = r.redirect
    else load()
  }
  async function toggleCancel(cancel) {
    await billing(cancel ? 'account.cancel' : 'account.resume')
    setConfirm(false)
    setMsg({ ok: true, text: cancel ? 'Subskrypcja zakończy się z końcem opłaconego okresu.' : 'Subskrypcja wznowiona.' })
    load()
  }
  async function saveCustomer() {
    try {
      await billing('account.update', { customer: edit })
      setEdit(null)
      setMsg({ ok: true, text: 'Dane do faktur zapisane.' })
      load()
    } catch (e) {
      setMsg({ ok: false, text: e.message === 'email' ? 'Nieprawidłowy e-mail do faktur.' : 'Nie udało się zapisać.' })
    }
  }

  if (err) return <div className="empty">Nie udało się wczytać płatności. Odśwież stronę.</div>
  if (!d) return <div className="skel skel-card" style={{ height: 260 }} />

  const s = d.subscription
  const c = d.customer
  const [tone, label] = s ? STATUS[s.status] ?? ['', s.status] : ['', '']

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            Abonament i faktury
          </div>
          <h1>Płatności</h1>
        </div>
      </div>

      <div style={{ maxWidth: 980 }}>
        {msg && <div className={`pay-note ${msg.ok ? "ok" : "err"}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

        {d.debt > 0 && (
          <div className="pay-debt">
            <div>
              <b>Zaległość: {zl(d.debt)}</b>
              <span>
                {d.blocked
                  ? 'AI Doradca jest wstrzymany do czasu opłacenia faktury. Dane i ustawienia są bezpieczne — po płatności wraca od razu.'
                  : 'Ostatnia płatność kartą nie przeszła. Zapłać, zanim doradca zostanie wstrzymany (7 dni od terminu).'}
              </span>
            </div>
            <button className="btn primary" onClick={pay}>Zapłać teraz</button>
          </div>
        )}

        {!s ? (
          <div className="empty">
            Ten workspace nie ma abonamentu opłacanego online. Faktury za wdrożenia wystawiamy osobno — napisz do opiekuna.
          </div>
        ) : (
          <>
            <div className="pay-kpis">
              <div className="stat">
                <span className="lbl">Plan</span>
                <b>{s.plan_name.replace(/ — abonament.*$/, '')}</b>
                <small>{s.plan_key === 'wdrozenie' ? 'z wdrożeniem' : 'abonament'}</small>
              </div>
              <div className="stat">
                <span className="lbl">Co miesiąc</span>
                <b>{zl(s.monthly_gross)}</b>
                <small>{zl(s.monthly_net)} netto + VAT</small>
              </div>
              <div className="stat">
                <span className="lbl">{s.cancel_at_period_end ? 'Abonament do' : 'Następna płatność'}</span>
                <b>{day(s.period_end)}</b>
                <small>{s.cancel_at_period_end ? 'potem bez odnowienia' : 'pobierzemy automatycznie'}</small>
              </div>
            </div>

            <div className="sec-h">Abonament</div>
            <div className="srows">
              <div className="srow">
                <div className="sl"><b>Status</b></div>
                <div className="sv"><span className={`badge ${tone}`}>{label}</span></div>
              </div>
              <div className="srow">
                <div className="sl"><b>Bieżący okres</b></div>
                <div className="sv">{day(s.period_start)} – {day(s.period_end)}</div>
              </div>
              <div className="srow">
                <div className="sl">
                  <b>Metoda płatności</b>
                  <small>Karta zapisana przy pierwszej płatności.</small>
                </div>
                <div className="sv">{s.card_label || 'płatność online'}</div>
              </div>
              <div className="srow">
                <div className="sl">
                  <b>{s.cancel_at_period_end ? 'Wznów abonament' : 'Anuluj abonament'}</b>
                  <small>
                    {s.cancel_at_period_end
                      ? 'Abonament wygaśnie z końcem okresu. Możesz go jeszcze wznowić.'
                      : 'Bez okresu wypowiedzenia — działa do końca opłaconego miesiąca.'}
                  </small>
                </div>
                <div className="sv">
                  {s.status !== 'canceled' &&
                    (s.cancel_at_period_end ? (
                      <button className="btn" onClick={() => toggleCancel(false)}>Wznów</button>
                    ) : confirm ? (
                      <div className="btn-group">
                        <button className="btn danger" onClick={() => toggleCancel(true)}>Tak, anuluj</button>
                        <button className="btn" onClick={() => setConfirm(false)}>Zostaję</button>
                      </div>
                    ) : (
                      <button className="btn" onClick={() => setConfirm(true)}>Anuluj</button>
                    ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* klient: faktury swojej firmy; administrator: wszystkie faktury platformy */}
        <Invoices invoices={session.user?.role === 'admin' ? undefined : d.invoices} />

        {c && (
          <>
            <div className="sec-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Dane do faktur</span>
              {!edit && <button className="btn" onClick={() => setEdit({ ...c })}>Edytuj</button>}
            </div>
            {!edit ? (
              <div className="srows">
                <div className="srow"><div className="sl"><b>Firma</b></div><div className="sv ell">{c.company_name}</div></div>
                <div className="srow"><div className="sl"><b>NIP</b></div><div className="sv">{c.nip}</div></div>
                <div className="srow"><div className="sl"><b>Adres</b></div><div className="sv">{c.street}, {c.postal_code} {c.city}</div></div>
                <div className="srow"><div className="sl"><b>Faktury wysyłamy na</b></div><div className="sv ell">{c.invoice_email || c.email}</div></div>
              </div>
            ) : (
              <div className="card" style={{ display: 'grid', gap: 12 }}>
                <p className="muted" style={{ margin: 0 }}>NIP zmienia się tylko przez opiekuna — to inna firma na fakturze.</p>
                {[
                  ['company_name', 'Nazwa firmy'],
                  ['street', 'Ulica i numer'],
                  ['postal_code', 'Kod pocztowy'],
                  ['city', 'Miasto'],
                  ['invoice_email', 'E-mail do faktur (puste = login)'],
                ].map(([k, l]) => (
                  <label className="f" key={k}>
                    <span>{l}</span>
                    <input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                  </label>
                ))}
                <div className="btn-group">
                  <button className="btn primary" onClick={saveCustomer}>Zapisz</button>
                  <button className="btn" onClick={() => setEdit(null)}>Anuluj</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
