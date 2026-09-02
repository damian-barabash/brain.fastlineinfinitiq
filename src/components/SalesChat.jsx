// Rdzeń testowego czatu sprzedawcy: Ty grasz klienta, AI sprzedaje.
// Rozmowa symulowana (wirtualny lead), nic nie zapisuje się w bazie ani statystykach.
// Używany w zakładce "Test rozmowy" panelu i na publicznej stronie /sdemo.
import { useEffect, useRef, useState } from 'react'
import { salesChatStream, salesApi } from '../lib/api.js'
import { IcSend, IcSpark, IcThumbDown, IcCheck } from './Icons.jsx'

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

const FLAG_BADGE = {
  won: ['Oznaczone: WYGRANA', 'badge ok'],
  lost: ['Oznaczone: PRZEGRANA', 'badge danger'],
  handoff: ['Oznaczone: PRZEKAZANIE do człowieka', 'badge warn'],
}

export default function SalesChat({ demoKey, storeKey, autoFocus }) {
  const saved = (() => {
    if (!storeKey) return null
    try {
      return JSON.parse(sessionStorage.getItem(storeKey) || 'null')
    } catch {
      return null
    }
  })()
  const [msgs, setMsgs] = useState(saved?.msgs || [])
  const [temp, setTemp] = useState(saved?.temp || 'cold')
  const [channel, setChannel] = useState(saved?.channel || 'email')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!storeKey) return
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ msgs, temp, channel }))
    } catch {
      /* quota */
    }
  }, [msgs, temp, channel, storeKey])

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  function reset(nextTemp = temp, nextChannel = channel) {
    setMsgs([])
    setTemp(nextTemp)
    setChannel(nextChannel)
    try {
      if (storeKey) sessionStorage.removeItem(storeKey)
    } catch {
      /* ignore */
    }
  }

  // history dla API: ai → assistant, user → user
  function apiHistory(list) {
    return list.filter((m) => m.content).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
  }

  function run(history) {
    setBusy(true)
    setMsgs((m) => [...m, { role: 'ai', content: '' }])
    salesChatStream(
      { key: demoKey, temp, channel, messages: history },
      {
        onDelta: (d) =>
          setMsgs((m) => {
            const nm = [...m]
            nm[nm.length - 1] = { ...nm[nm.length - 1], content: nm[nm.length - 1].content + d }
            return nm
          }),
        onDone: (jd) => {
          setBusy(false)
          setMsgs((m) => {
            const nm = [...m]
            const flag = jd.won ? 'won' : jd.lost ? 'lost' : jd.handoff ? 'handoff' : null
            nm[nm.length - 1] = { ...nm[nm.length - 1], flag }
            return nm
          })
        },
        onError: () => {
          setBusy(false)
          setMsgs((m) => {
            const nm = [...m]
            if (!nm[nm.length - 1].content) nm[nm.length - 1] = { ...nm[nm.length - 1], content: 'Błąd połączenia z AI. Spróbuj ponownie.' }
            return nm
          })
        },
      },
    )
  }

  function start() {
    if (busy || !demoKey) return
    run(apiHistory(msgs))
  }
  function send() {
    const text = input.trim()
    if (!text || busy || !demoKey) return
    setInput('')
    const next = [...msgs, { role: 'user', content: text }]
    setMsgs(next)
    run(apiHistory(next))
  }

  const started = msgs.length > 0
  return (
    <>
      <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <div className="chips">
          <button className={temp === 'cold' ? 'on' : ''} onClick={() => reset('cold', channel)} title="Symuluj zimnego leada (nowa rozmowa)">
            Zimny lead
          </button>
          <button className={temp === 'warm' ? 'on' : ''} onClick={() => reset('warm', channel)} title="Symuluj ciepłego leada (nowa rozmowa)">
            Ciepły lead
          </button>
        </div>
        <div className="chips">
          <button className={channel === 'email' ? 'on' : ''} onClick={() => reset(temp, 'email')} title="Symulacja e-maila (nowa rozmowa)">
            E-mail
          </button>
          <button className={channel === 'whatsapp' ? 'on' : ''} onClick={() => reset(temp, 'whatsapp')} title="Symulacja WhatsApp (nowa rozmowa)">
            WhatsApp
          </button>
        </div>
      </div>
      <div className="chat-msgs" ref={boxRef}>
        {!started && (
          <div style={{ display: 'grid', placeItems: 'center', gap: 12, padding: '32px 16px', textAlign: 'center' }}>
            <p className="muted" style={{ maxWidth: 380 }}>
              Sprzedawca pisze pierwszy — tak jak do prawdziwego leada. Wygeneruj pierwszą wiadomość, a potem odpisuj jako
              klient.
            </p>
            <button className="btn primary" onClick={start} disabled={busy || !demoKey}>
              <IcSpark /> {busy ? 'Generowanie…' : 'Wygeneruj pierwszą wiadomość'}
            </button>
          </div>
        )}
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
            {m.flag && (
              <span className={FLAG_BADGE[m.flag][1]} style={{ marginTop: 4 }}>
                {FLAG_BADGE[m.flag][0]}
              </span>
            )}
            {m.role !== 'user' && m.content && demoKey && <Correct demoKey={demoKey} original={m.content} />}
          </div>
        ))}
        {started && !busy && msgs[msgs.length - 1]?.role === 'ai' && !msgs[msgs.length - 1]?.flag && (
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn sm" onClick={start} title="Klient milczy — zobacz follow-up">
              <IcSpark /> Symuluj brak odpowiedzi (follow-up)
            </button>
          </div>
        )}
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={started ? 'Odpisz jako klient…' : 'Najpierw wygeneruj pierwszą wiadomość'}
          disabled={!demoKey || !started}
          autoFocus={autoFocus}
        />
        <button className="send" onClick={send} disabled={busy || !demoKey || !started} aria-label="Wyślij">
          <IcSend />
        </button>
      </div>
    </>
  )
}

// Poprawka do wiadomości sprzedawcy. Czat jest symulowany i nic nie zapisuje,
// więc zapamiętujemy samą uwagę trenera — działa od następnej wiadomości
// i widać ją w panelu „Poprawki z czatów" nad zakładkami.
function Correct({ demoKey, original }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [state, setState] = useState('')

  async function save() {
    if (!note.trim()) return
    setState('busy')
    try {
      await salesApi(demoKey, 'lesson', { note: note.trim(), original })
      setState('done')
      setNote('')
      setTimeout(() => {
        setOpen(false)
        setState('')
      }, 1500)
    } catch (e) {
      setState(e.message)
    }
  }

  if (!open) {
    return (
      <button className="btn sm" style={{ marginTop: 4 }} onClick={() => setOpen(true)} title="Napisz, co poprawić">
        <IcThumbDown /> Popraw
      </button>
    )
  }
  return (
    <div className="lesson-inline">
      <textarea
        rows={2}
        autoFocus
        placeholder="Co jest nie tak? np. za długie, nie podał ceny, znów się przedstawił"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        }}
      />
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm primary" onClick={save} disabled={state === 'busy'}>
          <IcCheck /> {state === 'busy' ? 'Zapisuję…' : 'Zapamiętaj na stałe'}
        </button>
        <button className="btn sm" onClick={() => setOpen(false)}>Anuluj</button>
        {state === 'done' && <span className="muted">Zapamiętane — działa od następnej wiadomości.</span>}
        {state && !['busy', 'done'].includes(state) && <span className="err">{state}</span>}
      </div>
    </div>
  )
}
