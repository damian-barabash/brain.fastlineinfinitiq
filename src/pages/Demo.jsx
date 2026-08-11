// Publiczna strona demo czatu (/demo?key=…) — do wysłania klientowi.
// Samodzielne okno rozmowy z doradcą projektu, bez logowania i bez panelu.
import { useEffect, useRef, useState } from 'react'
import { chatStream, chatHello } from '../lib/api.js'
import ChatFeedback from '../components/ChatFeedback.jsx'
import { IcSend, IcRefresh } from '../components/Icons.jsx'

function visitorId() {
  let v = localStorage.getItem('brain_visitor')
  if (!v) {
    v = 'v_' + crypto.randomUUID().slice(0, 18)
    localStorage.setItem('brain_visitor', v)
  }
  return v
}

function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer">
        {p}
      </a>
    ) : (
      p
    ),
  )
}

export default function Demo() {
  const q = new URLSearchParams(window.location.search)
  const key = q.get('key') || ''
  const [hello, setHello] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [convId, setConvId] = useState(null)
  const boxRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    if (key) chatHello(key).then(setHello).catch(() => setHello({ error: true }))
  }, [key])

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, hello])

  function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'ai', content: '' }])
    chatStream(
      { key, message: text, conversationId: convId, visitorId: visitorId() },
      {
        onDelta: (d) =>
          setMsgs((m) => {
            const nm = [...m]
            nm[nm.length - 1] = { ...nm[nm.length - 1], content: nm[nm.length - 1].content + d }
            return nm
          }),
        onDone: (jd) => {
          setConvId(jd.conversation_id)
          setBusy(false)
          setMsgs((m) => {
            const nm = [...m]
            nm[nm.length - 1] = { ...nm[nm.length - 1], dbId: jd.message_id }
            return nm
          })
        },
        onError: () => {
          setBusy(false)
          setMsgs((m) => {
            const nm = [...m]
            if (!nm[nm.length - 1].content)
              nm[nm.length - 1] = { ...nm[nm.length - 1], content: 'Przepraszam, coś poszło nie tak. Spróbuj ponownie.' }
            return nm
          })
        },
      },
    )
  }

  if (!key) {
    return (
      <div className="center-page">
        <p className="muted">Brak klucza w linku.</p>
      </div>
    )
  }

  return (
    <div className="center-page" style={{ alignItems: 'stretch', padding: '28px 16px' }}>
      <div
        className="auth-card demo-card"
        style={{ maxWidth: 560, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', padding: 0, height: 'calc(100vh - 56px)', maxHeight: 760 }}
      >
        <span style={{ position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid', borderWidth: '2px 0 0 2px', top: -1, left: -1 }} />
        <span style={{ position: 'absolute', width: 14, height: 14, borderColor: 'var(--acid-line)', borderStyle: 'solid', borderWidth: '0 2px 2px 0', bottom: -1, right: -1 }} />
        <div className="row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <span className="dot" />
          <div>
            <b style={{ fontFamily: 'Archivo, sans-serif', fontStretch: '125%', textTransform: 'uppercase', fontSize: 14, letterSpacing: '.02em', display: 'block' }}>
              {hello?.persona || 'Asystent AI'}
            </b>
            {hello?.project && (
              <span className="mono" style={{ fontSize: 9.5 }}>
                {hello.project}
              </span>
            )}
          </div>
          <span className="badge acid right">Demo</span>
          <button
            className="btn sm"
            onClick={() => {
              setMsgs([])
              setConvId(null)
            }}
            title="Nowa rozmowa"
          >
            <IcRefresh />
          </button>
        </div>
        <div className="chat-msgs" ref={boxRef}>
          {hello && !hello.error && <div className="msg ai">{hello.greeting}</div>}
          {hello?.error && <div className="msg ai">Ten link demo jest nieaktywny.</div>}
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                {m.content ? (
                  linkify(m.content)
                ) : (
                  <span className="typing" style={{ padding: 0 }}>
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
              {m.role === 'ai' && m.dbId && (
                <ChatFeedback
                  chatKey={key}
                  messageId={m.dbId}
                  onReplace={(c) =>
                    setMsgs((mm) => {
                      const nm = [...mm]
                      nm[i] = { ...nm[i], content: c }
                      return nm
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Napisz wiadomość…"
            autoFocus
          />
          <button className="send" onClick={send} disabled={busy} aria-label="Wyślij">
            <IcSend />
          </button>
        </div>
        <div className="mono" style={{ textAlign: 'center', padding: '7px 0 10px', fontSize: 9 }}>
          powered by Fastline InfinitiQ // Brain
        </div>
      </div>
    </div>
  )
}
