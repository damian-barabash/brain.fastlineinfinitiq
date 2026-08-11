// Trening doradcy: kciuk w górę/dół pod odpowiedzią AI.
// Kciuk w dół → uwaga trenera → AI przepisuje odpowiedź → "OK, zapamiętaj" zapisuje lekcję NA STAŁE.
import { useState } from 'react'
import { chatAction, chatStreamRaw } from '../lib/api.js'
import { IcThumbUp, IcThumbDown, IcCheck, IcX, IcSpark } from './Icons.jsx'

export default function ChatFeedback({ chatKey, messageId, onReplace, onRewriteState }) {
  const [phase, setPhase] = useState('idle') // idle | up | noting | rewriting | decide | saved | rejected
  const [note, setNote] = useState('')
  const [feedbackId, setFeedbackId] = useState(null)

  async function thumbUp() {
    setPhase('up')
    chatAction(chatKey, { action: 'rate', message_id: messageId, rating: 'up' }).catch(() => {})
  }

  function rewrite() {
    const n = note.trim()
    if (!n) return
    setPhase('rewriting')
    onRewriteState?.(true)
    let acc = ''
    onReplace('')
    chatStreamRaw(
      { key: chatKey, action: 'rewrite', message_id: messageId, note: n },
      {
        onDelta: (d) => {
          acc += d
          onReplace(acc)
        },
        onDone: (jd) => {
          setFeedbackId(jd.feedback_id)
          setPhase('decide')
          onRewriteState?.(false)
        },
        onError: () => {
          setPhase('noting')
          onRewriteState?.(false)
        },
      },
    )
  }

  async function decide(ok) {
    setPhase(ok ? 'saved' : 'rejected')
    chatAction(chatKey, { action: 'feedback.decide', feedback_id: feedbackId, ok }).catch(() => {})
  }

  const iconBtn = {
    width: 26,
    height: 26,
    display: 'grid',
    placeItems: 'center',
    border: '1px solid var(--line)',
    color: 'var(--dim)',
    background: 'var(--panel)',
  }

  if (phase === 'idle') {
    return (
      <span className="row" style={{ gap: 4, marginTop: 6 }}>
        <button style={iconBtn} onClick={thumbUp} title="Dobra odpowiedź" aria-label="Dobra odpowiedź">
          <IcThumbUp style={{ width: 13, height: 13 }} />
        </button>
        <button
          style={iconBtn}
          onClick={() => setPhase('noting')}
          title="Zła odpowiedź — popraw"
          aria-label="Zła odpowiedź"
        >
          <IcThumbDown style={{ width: 13, height: 13 }} />
        </button>
      </span>
    )
  }
  if (phase === 'up') {
    return (
      <span className="badge ok" style={{ marginTop: 6 }}>
        <IcCheck style={{ width: 10, height: 10 }} /> Dzięki za ocenę
      </span>
    )
  }
  if (phase === 'noting') {
    return (
      <span className="row" style={{ gap: 6, marginTop: 8, width: '100%' }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && rewrite()}
          placeholder="Co poprawić? Jak ma odpowiadać?"
          style={{ flex: 1, minWidth: 180, padding: '7px 10px', fontSize: 13 }}
          autoFocus
        />
        <button className="btn sm primary" onClick={rewrite} disabled={!note.trim()}>
          Popraw
        </button>
        <button className="btn sm" onClick={() => setPhase('idle')} aria-label="Anuluj">
          <IcX />
        </button>
      </span>
    )
  }
  if (phase === 'rewriting') {
    return (
      <span className="badge" style={{ marginTop: 6 }}>
        <IcSpark style={{ width: 10, height: 10 }} /> Przepisuję odpowiedź…
      </span>
    )
  }
  if (phase === 'decide') {
    return (
      <span className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn sm primary" onClick={() => decide(true)}>
          <IcCheck /> OK, zapamiętaj na zawsze
        </button>
        <button className="btn sm danger" onClick={() => decide(false)}>
          <IcX /> Odrzuć
        </button>
      </span>
    )
  }
  if (phase === 'saved') {
    return (
      <span className="badge acid" style={{ marginTop: 6 }}>
        <IcCheck style={{ width: 10, height: 10 }} /> Zapamiętane na zawsze
      </span>
    )
  }
  return (
    <span className="badge" style={{ marginTop: 6 }}>
      Poprawka odrzucona
    </span>
  )
}
