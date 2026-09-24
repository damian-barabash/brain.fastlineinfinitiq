// Okno postępu — wspólne dla całej platformy: ręczna wysyłka partii (Hand, sprzedawca Brain),
// wyszukiwanie leadów, każda inna dłuższa operacja. Pokazuje, co się dzieje TERAZ, ile zrobione,
// listę zdarzeń (kto dostał, u kogo błąd) i pozwala przerwać po bieżącym kroku.
//   done/total     → pasek procentowy; brak total → pasek nieokreślony („trwa…")
//   lines          → [{ text, ok?: true|false }] — historia kroków, najnowszy na dole
//   running        → true: kółko + „Przerwij"; false: „Zamknij"
import { useEffect, useRef, useState } from 'react'
import { IcX, IcCheck } from './Icons.jsx'

export default function ProgressModal({ open, title, subtitle, done = 0, total = 0, lines = [], running, onCancel, onClose }) {
  const [t0] = useState(() => Date.now())
  const [sec, setSec] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open || !running) return
    const id = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [open, running, t0])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [lines.length])

  if (!open) return null
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="modal-bg" onClick={() => !running && onClose?.()}>
      <div className="modal pmodal" onClick={(e) => e.stopPropagation()} role="dialog" aria-live="polite">
        <div className="row" style={{ marginBottom: 6 }}>
          {running ? <span className="pm-spin" /> : <IcCheck style={{ width: 16, height: 16, color: 'var(--acid)' }} />}
          <b>{title}</b>
          <span className="mono right" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>{sec} s</span>
        </div>
        {subtitle && <p className="muted" style={{ fontSize: 13 }}>{subtitle}</p>}
        <div className={'pm-bar' + (total ? '' : ' indet')}>
          <i style={{ width: `${total ? pct : 35}%` }} />
        </div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--dim)' }}>
          {total ? `${done} z ${total} · ${pct}%` : running ? 'trwa…' : 'gotowe'}
        </div>
        {!!lines.length && (
          <div className="pm-lines" ref={listRef}>
            {lines.map((l, i) => (
              <div key={i} className="pm-line">
                {l.ok === true && <IcCheck className="ok" style={{ width: 13, height: 13 }} />}
                {l.ok === false && <IcX className="err" style={{ width: 13, height: 13 }} />}
                {l.ok === undefined && <span className="mono" style={{ fontSize: 10, color: 'var(--dim2)' }}>·</span>}
                <span className={l.ok === false ? 'err' : ''}>{l.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          {running ? (
            <button className="btn sm" onClick={onCancel} disabled={!onCancel}>
              <IcX /> Przerwij po bieżącym
            </button>
          ) : (
            <button className="btn sm primary" onClick={onClose}>
              <IcCheck /> Zamknij
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
