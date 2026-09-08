// Wspólny kanał e-mail PROJEKTU (Resend). Ten sam ekran w każdym produkcie:
// ustawiony w AI Łowcy Leadów działa w AI Sprzedawcy i w każdym następnym produkcie,
// bo wszyscy czytają jedno miejsce (`fiq_project_integrations`, kind = 'email').
//
// Wcześniej klucz i adres nadawcy siedziały w ustawieniach sprzedawcy w Brain —
// klient bez tego produktu nie miał ich gdzie wpisać.
import { useEffect, useState } from 'react'
import { api } from './platform.js'
import { IcMail, IcCheck } from './Icons.jsx'

const EMPTY = { resend_key: '', from_name: '', from_email: '', reply_to: '', signature: '' }
const MASK = '••••'

export default function ProjectEmail({ projectId, note }) {
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  async function load() {
    try {
      const d = await api('proj.integration', { project_id: projectId, kind: 'email' })
      setCfg({ ...EMPTY, ...(d.config ?? {}) })
    } catch (e) {
      setMsg(e.message)
    }
  }
  useEffect(() => {
    setCfg(null)
    setDirty(false)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const set = (k) => (e) => {
    setDirty(true)
    setCfg((c) => ({ ...c, [k]: e.target.value }))
  }

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      const d = await api('proj.integration.set', { project_id: projectId, kind: 'email', config: cfg })
      setCfg({ ...EMPTY, ...(d.config ?? {}) })
      setDirty(false)
      setMsg('Zapisane — działa we wszystkich produktach tego projektu.')
    } catch (e) {
      setMsg('Nie udało się zapisać: ' + e.message)
    }
    setBusy(false)
  }

  if (!cfg) return <div className="muted">Wczytywanie kanału e-mail…</div>

  // klucz zamaskowany („••••abcd") znaczy, że jest zapisany w bazie
  const ready = !!cfg.resend_key && !!cfg.from_email

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <IcMail style={{ width: 17, height: 17, flexShrink: 0, color: 'var(--product-accent)' }} />
        <b>E-mail (Resend)</b>
        <span className="right">
          {ready ? <span className="badge acid">Skonfigurowany</span> : <span className="badge">Nieaktywny</span>}
        </span>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        {note ?? 'Adres, z którego piszą agenci tego projektu.'}{' '}
        <b>Ustawienie jest wspólne dla wszystkich produktów</b> — wpisujesz raz, działa wszędzie.
      </p>

      <div className="fgrid" style={{ marginTop: 12 }}>
        <label className="f">
          <span className="mono">Klucz API Resend</span>
          <input
            type="password"
            autoComplete="off"
            value={cfg.resend_key || ''}
            onChange={set('resend_key')}
            placeholder="re_…"
          />
        </label>
        <label className="f">
          <span className="mono">Nazwa nadawcy</span>
          <input value={cfg.from_name || ''} onChange={set('from_name')} placeholder="Kacper z Twojej Firmy" />
        </label>
      </div>
      <div className="fgrid">
        <label className="f">
          <span className="mono">Adres nadawcy</span>
          <input value={cfg.from_email || ''} onChange={set('from_email')} placeholder="kontakt@twojafirma.pl" />
        </label>
        <label className="f">
          <span className="mono">Adres do odpowiedzi</span>
          <input value={cfg.reply_to || ''} onChange={set('reply_to')} placeholder="oferty@twojafirma.pl" />
        </label>
      </div>
      <label className="f">
        <span className="mono">Podpis pod wiadomością</span>
        <input value={cfg.signature || ''} onChange={set('signature')} placeholder="Kacper Nowak, Twoja Firma, +48 …" />
      </label>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Zapisywanie…' : 'Zapisz kanał e-mail'}
        </button>
        {msg && (
          <span className="mono" style={{ fontSize: 11, opacity: 0.75 }}>
            {msg.startsWith('Zapisane') && <IcCheck style={{ width: 13, height: 13, marginRight: 5 }} />}
            {msg}
          </span>
        )}
      </div>

      {cfg.resend_key?.startsWith(MASK) && (
        <p className="mono" style={{ fontSize: 9.5, opacity: 0.55, marginTop: 8 }}>
          klucz zapisany — pole pokazuje tylko końcówkę; zostaw jak jest, żeby go nie zmieniać
        </p>
      )}

      <div className="note" style={{ marginTop: 12 }}>
        Domena adresu nadawcy musi być zweryfikowana w Resend, inaczej dostawca odrzuci wysyłkę.
      </div>
    </div>
  )
}
