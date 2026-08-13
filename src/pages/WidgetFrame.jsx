// Strona czatu w iframe widgetu (/w?key=…&color=…). Publiczna, bez logowania.
import { useEffect, useRef, useState } from 'react'
import { chatStream, chatHello } from '../lib/api.js'
import { IcSend, IcX } from '../components/Icons.jsx'

function visitorId() {
  let v = localStorage.getItem('brain_visitor')
  if (!v) {
    v = 'v_' + crypto.randomUUID().slice(0, 18)
    localStorage.setItem('brain_visitor', v)
  }
  return v
}

// prosta detekcja linków w odpowiedzi
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

export default function WidgetFrame() {
  const q = new URLSearchParams(window.location.search)
  const key = q.get('key') || ''
  const color = /^#[0-9a-fA-F]{6}$/.test(q.get('color') || '') ? q.get('color') : '#B8FF00'
  const bg = /^#[0-9a-fA-F]{6}$/.test(q.get('bg') || '') ? q.get('bg') : null
  const [hello, setHello] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [convId, setConvId] = useState(() => sessionStorage.getItem('brain_conv') || null)
  const boxRef = useRef(null)

  useEffect(() => {
    // tło okna z konfiguracji widgetu — motyw (kolory tekstu/bąbelków) dobiera się po jasności tła
    const light = bg ? parseInt(bg.slice(1), 16) > 0x7fffff : q.get('theme') === 'light'
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
    if (key) chatHello(key).then(setHello).catch(() => setHello({ error: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          sessionStorage.setItem('brain_conv', jd.conversation_id)
          setBusy(false)
        },
        onError: () => {
          setBusy(false)
          setMsgs((m) => {
            const nm = [...m]
            if (!nm[nm.length - 1].content) nm[nm.length - 1] = { ...nm[nm.length - 1], content: 'Przepraszam, coś poszło nie tak. Spróbuj ponownie.' }
            return nm
          })
        },
      },
    )
  }

  const ink = parseInt(color.slice(1), 16) > 0x7fffff ? '#0d0d0d' : '#ffffff'

  if (!key) return <div style={{ padding: 20 }} className="muted">Brak klucza widgetu.</div>
  return (
    <div className="chat" style={{ height: '100vh', background: bg || 'var(--bg)' }}>
      <div
        className="row"
        style={{ padding: '13px 16px', background: color, color: ink, flexShrink: 0 }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ink, opacity: 0.85 }} />
        <b style={{ fontFamily: 'Space Grotesk, sans-serif', textTransform: 'uppercase', fontSize: 13.5, letterSpacing: '.02em' }}>
          {hello?.persona || 'Asystent AI'}
        </b>
        <button
          className="right"
          style={{ color: ink, display: 'grid', placeItems: 'center' }}
          onClick={() => window.parent?.postMessage({ brain: 'close' }, '*')}
          aria-label="Zamknij"
        >
          <IcX style={{ width: 17, height: 17 }} />
        </button>
      </div>
      <div className="chat-msgs" ref={boxRef}>
        {hello && !hello.error && <div className="msg ai">{hello.greeting}</div>}
        {hello?.error && <div className="msg ai">Widget jest chwilowo niedostępny.</div>}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}
            style={m.role === 'user' ? { background: color, color: ink } : undefined}
          >
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
        ))}
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Napisz wiadomość…"
        />
        <button className="send" style={{ background: color, color: ink }} onClick={send} disabled={busy} aria-label="Wyślij">
          <IcSend />
        </button>
      </div>
      <div className="mono" style={{ textAlign: 'center', padding: '6px 0 9px', fontSize: 9 }}>
        powered by Fastline InfinitiQ
      </div>
    </div>
  )
}
