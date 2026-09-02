// AI Doradca: Archetyp / Test rozmowy / Integracje (widget embed + Meta API).
import { useEffect, useRef, useState } from 'react'
import { api, session, chatStream, FN_BASE, PANEL_ORIGIN } from '../lib/api.js'
import { useCached } from '../lib/useCached.js'
import ChatFeedback from '../components/ChatFeedback.jsx'
import Lessons from '../shared/Lessons.jsx'
import {
  IcCheck,
  IcSend,
  IcCopy,
  IcRefresh,
  IcWhatsApp,
  IcInstagram,
  IcFacebook,
  IcChat,
  IcKey,
  IcGlobe,
} from '../components/Icons.jsx'

const TONES = ['Profesjonalny', 'Przyjazny', 'Ekspercki', 'Energiczny', 'Spokojny i rzeczowy']

export default function Advisor() {
  const proj = session.proj
  const [tab, setTab] = useState('archetype')
  const [chData, refreshChannels] = useCached('channels.list', { project_id: proj.id })
  const channels = chData?.channels ?? null

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {proj.name} // cyfrowy pracownik
          </div>
          <h1>AI Doradca</h1>
          <p className="sub">Persona, sposób mówienia i kanały, w których pracuje.</p>
        </div>
      </div>
      <Lessons
        projId={proj.id}
        scope="advisor"
        title="Poprawki z czatów — doradca"
        hint="Uwagi, które dawałeś doradcy w rozmowach testowych. Włączone dopisują się do jego instrukcji i działają na wszystkich kanałach."
      />
      <div className="tabs">
        <button className={tab === 'archetype' ? 'on' : ''} onClick={() => setTab('archetype')}>
          Archetyp
        </button>
        <button className={tab === 'test' ? 'on' : ''} onClick={() => setTab('test')}>
          Test rozmowy
        </button>
      </div>
      {tab === 'archetype' && <Archetype projId={proj.id} />}
      {tab === 'test' && <TestChat projId={proj.id} channels={channels} refreshChannels={refreshChannels} />}
    </>
  )
}


// ── Archetyp ────────────────────────────────────────────────────────────────
function Archetype({ projId }) {
  const [cached] = useCached('advisor.get', { project_id: projId })
  const [cfg, setCfg] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    // świeże dane z sieci nadpisują formularz dopóki użytkownik nic nie zmienił
    if (cached && !dirtyRef.current) setCfg(cached.config || {})
  }, [cached])

  function set(k, v) {
    dirtyRef.current = true
    setCfg((c) => ({ ...c, [k]: v }))
    setSaved(false)
  }
  async function save() {
    setBusy(true)
    try {
      await api('advisor.set', { project_id: projId, config: cfg })
      dirtyRef.current = false
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  if (!cfg) return <p className="muted">Ładowanie…</p>
  return (
    <div className="grid g2">
      <div className="card">
        <span className="corner tl" />
        <span className="corner br" />
        <h3 style={{ marginBottom: 16, fontSize: 14 }}>Persona</h3>
        <label className="f">
          <span className="mono">Imię / nazwa persony</span>
          <input value={cfg.persona || ''} onChange={(e) => set('persona', e.target.value)} placeholder="np. Natalia — doradczyni klienta" />
        </label>
        <label className="f">
          <span className="mono">Rola (kim jest i za co odpowiada)</span>
          <textarea
            value={cfg.role_desc || ''}
            onChange={(e) => set('role_desc', e.target.value)}
            placeholder="Pomagasz klientom poznać ofertę, doradzasz wybór produktu, podajesz linki do zakupu."
          />
        </label>
        <label className="f">
          <span className="mono">Powitanie (pierwsza wiadomość)</span>
          <textarea value={cfg.greeting || ''} onChange={(e) => set('greeting', e.target.value)} placeholder="Cześć! W czym mogę pomóc?" style={{ minHeight: 60 }} />
        </label>
        <label className="f">
          <span className="mono">Język</span>
          <select value={cfg.language || 'pl'} onChange={(e) => set('language', e.target.value)}>
            <option value="pl">Zawsze polski</option>
            <option value="auto">Dopasuj do języka klienta</option>
          </select>
        </label>
      </div>
      <div className="card">
        <span className="corner tl" />
        <span className="corner br" />
        <h3 style={{ marginBottom: 16, fontSize: 14 }}>Ton i zasady</h3>
        <label className="f">
          <span className="mono">Ton wypowiedzi</span>
          <div className="chips" style={{ marginBottom: 8 }}>
            {TONES.map((t) => (
              <button key={t} type="button" className={cfg.tone === t ? 'on' : ''} onClick={() => set('tone', t)}>
                {t}
              </button>
            ))}
          </div>
          <input value={cfg.tone || ''} onChange={(e) => set('tone', e.target.value)} placeholder="…albo opisz własny ton" />
        </label>
        <label className="f">
          <span className="mono">Długość odpowiedzi</span>
          <div className="chips">
            {[
              ['short', 'Krótkie'],
              ['medium', 'Średnie'],
              ['long', 'Rozbudowane'],
            ].map(([k, l]) => (
              <button key={k} type="button" className={(cfg.length || 'medium') === k ? 'on' : ''} onClick={() => set('length', k)}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <label className="f">
          <span className="mono">Dodatkowe zasady (opcjonalnie)</span>
          <textarea value={cfg.rules || ''} onChange={(e) => set('rules', e.target.value)} placeholder="np. Nie podawaj rabatów. Zwracaj się per Pan/Pani." />
        </label>
        <label className="f">
          <span className="mono">Kiedy przekazać do działu sprzedaży</span>
          <textarea
            value={cfg.escalation || ''}
            onChange={(e) => set('escalation', e.target.value)}
            placeholder="np. Gdy klient pyta o cenę indywidualną, reklamację albo wprost prosi o kontakt z człowiekiem."
            style={{ minHeight: 60 }}
          />
        </label>
        <div className="row">
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz archetyp'}
          </button>
          {saved && (
            <span className="badge ok">
              <IcCheck style={{ width: 11, height: 11 }} /> Zapisano
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Test rozmowy ────────────────────────────────────────────────────────────
function TestChat({ projId, channels, refreshChannels }) {
  const key = channels?.find((c) => c.type === 'widget' && !c.config?.demo)?.public_key
  const demoCh = channels?.find((c) => c.config?.demo)
  // rozmowa testowa przeżywa nawigację po panelu (sessionStorage per projekt)
  const storeKey = `brain_testchat:${projId}`
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(storeKey) || 'null')
    } catch {
      return null
    }
  })()
  const [msgs, setMsgs] = useState(saved?.msgs || [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [convId, setConvId] = useState(saved?.convId || null)
  const [linkOk, setLinkOk] = useState(false)
  const [rotating, setRotating] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ msgs, convId }))
    } catch {
      /* quota */
    }
  }, [msgs, convId, storeKey])
  // link demo wisi na OSOBNYM kanale — rotacja nie psuje widgetu wklejonego na strony klientów;
  // origin bieżący, więc działa i na localhost, i na domenie produkcyjnej
  const demoUrl = demoCh ? `${window.location.origin}/demo?key=${demoCh.public_key}` : ''

  useEffect(() => {
    // kanał demo tworzy się sam przy pierwszym wejściu w zakładkę
    if (channels && !demoCh) {
      api('channels.create', { project_id: projId, type: 'widget', name: 'Link demo', config: { demo: true } })
        .then(() => refreshChannels())
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  async function rotateLink() {
    if (!demoCh || rotating) return
    if (!confirm('Stary link demo natychmiast przestanie działać. Wygenerować nowy?')) return
    setRotating(true)
    try {
      await api('channels.rotateKey', { id: demoCh.id })
      await refreshChannels()
    } finally {
      setRotating(false)
    }
  }

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight })
  }, [msgs])

  function send() {
    const text = input.trim()
    if (!text || busy || !key) return
    setInput('')
    setBusy(true)
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'ai', content: '' }])
    const t0 = performance.now()
    chatStream(
      { key, message: text, conversationId: convId, visitorId: 'panel-test' },
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
            nm[nm.length - 1] = { ...nm[nm.length - 1], t: ((performance.now() - t0) / 1000).toFixed(1), dbId: jd.message_id }
            return nm
          })
        },
        onError: () => {
          setBusy(false)
          setMsgs((m) => {
            const nm = [...m]
            nm[nm.length - 1] = { ...nm[nm.length - 1], content: nm[nm.length - 1].content || 'Błąd połączenia z AI.' }
            return nm
          })
        },
      },
    )
  }

  return (
    <div className="card" style={{ height: '62vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <span className="dot" />
        <span className="mono" style={{ color: 'var(--text)' }}>Podgląd na żywo — rozmowa testowa</span>
        <span className="right row" style={{ gap: 6 }}>
          <button
            className="btn sm"
            disabled={!demoCh}
            onClick={() => {
              navigator.clipboard.writeText(demoUrl)
              setLinkOk(true)
              setTimeout(() => setLinkOk(false), 1600)
            }}
            title="Publiczny link demo — wyślij klientowi, otworzy sam czat bez panelu"
          >
            {linkOk ? <IcCheck /> : <IcCopy />} {linkOk ? 'Skopiowano' : 'Kopiuj link demo'}
          </button>
          <a className="btn sm" href={demoUrl || '#'} target="_blank" rel="noreferrer" aria-disabled={!demoCh}>
            <IcGlobe /> Otwórz
          </a>
          <button
            className="btn sm danger"
            disabled={!demoCh || rotating}
            onClick={rotateLink}
            title="Unieważnij stary link i wygeneruj nowy"
          >
            <IcKey /> {rotating ? 'Generowanie…' : 'Nowy link'}
          </button>
          <button
            className="btn sm"
            onClick={() => {
              setMsgs([])
              setConvId(null)
              try {
                sessionStorage.removeItem(storeKey)
              } catch {
                /* ignore */
              }
            }}
          >
            <IcRefresh /> Nowa rozmowa
          </button>
        </span>
      </div>
      <div className="chat-msgs" ref={boxRef}>
        {!msgs.length && <p className="muted">Napisz wiadomość, aby sprawdzić jak odpowiada doradca z aktualną bazą wiedzy i archetypem.</p>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
              {m.content || <span className="typing" style={{ padding: 0 }}><i /><i /><i /></span>}
              {m.t && (
                <div className="mono" style={{ marginTop: 6, fontSize: 9.5, opacity: 0.7 }}>
                  {m.t} s
                </div>
              )}
            </div>
            {m.role === 'ai' && m.dbId && key && (
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
          placeholder={key ? 'Napisz wiadomość…' : 'Brak kanału widget w projekcie'}
          disabled={!key}
        />
        <button className="send" onClick={send} disabled={busy || !key} aria-label="Wyślij">
          <IcSend />
        </button>
      </div>
    </div>
  )
}

// ── Integracje ──────────────────────────────────────────────────────────────
