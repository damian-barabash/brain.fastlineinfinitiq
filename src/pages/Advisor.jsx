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
        <button className={tab === 'integrations' ? 'on' : ''} onClick={() => setTab('integrations')}>
          Integracje
        </button>
      </div>
      {tab === 'archetype' && <Archetype projId={proj.id} />}
      {tab === 'test' && <TestChat projId={proj.id} channels={channels} refreshChannels={refreshChannels} />}
      {tab === 'integrations' && <Integrations projId={proj.id} channels={channels} refreshChannels={refreshChannels} />}
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
function CodeBox({ code }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="codebox">
      {code}
      <button
        className="btn sm copy"
        onClick={() => {
          navigator.clipboard.writeText(code)
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        }}
      >
        {ok ? <IcCheck /> : <IcCopy />} {ok ? 'Skopiowano' : 'Kopiuj'}
      </button>
    </div>
  )
}

function Integrations({ projId, channels, refreshChannels }) {
  const widget = channels?.find((c) => c.type === 'widget' && !c.config?.demo)
  const [color, setColor] = useState(widget?.config?.color || '#B8FF00')
  const [iconColor, setIconColor] = useState(widget?.config?.icon_color || '')
  const [winBg, setWinBg] = useState(widget?.config?.win_bg || '#0D0D0D')
  const [position, setPosition] = useState(widget?.config?.position || 'left')
  const [waPhone, setWaPhone] = useState(widget?.config?.wa_phone || '')
  const [savedW, setSavedW] = useState(false)
  const dirtyW = useRef(false)
  const widgetCfgKey = JSON.stringify(widget?.config ?? null)

  useEffect(() => {
    // świeży config z sieci wchodzi do pól dopóki użytkownik nic nie zmienił
    if (widget && !dirtyW.current) {
      setColor(widget.config?.color || '#B8FF00')
      setIconColor(widget.config?.icon_color || '')
      setWinBg(widget.config?.win_bg || '#0D0D0D')
      setPosition(widget.config?.position || 'left')
      setWaPhone(widget.config?.wa_phone || '')
    }
  }, [widget?.id, widgetCfgKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveWidget() {
    await api('channels.update', {
      id: widget.id,
      config: { ...widget.config, color, position, wa_phone: waPhone, icon_color: iconColor, win_bg: winBg },
    })
    dirtyW.current = false
    await refreshChannels()
    setSavedW(true)
    setTimeout(() => setSavedW(false), 1600)
  }

  if (!channels) return <p className="muted">Ładowanie…</p>
  const WIDGET_V = 2 // podbijać przy każdej zmianie public/widget.js
  const embed = widget
    ? `<script src="${PANEL_ORIGIN}/widget.js?v=${WIDGET_V}" data-key="${widget.public_key}" data-color="${color}"${iconColor ? ` data-icon="${iconColor}"` : ''} data-bg="${winBg}" data-position="${position}" async></script>`
    : ''
  const embedWa = widget
    ? `<script src="${PANEL_ORIGIN}/widget.js?v=${WIDGET_V}" data-mode="whatsapp" data-phone="${waPhone || '48XXXXXXXXX'}" data-color="#25D366" data-position="${position}" async></script>`
    : ''

  return (
    <>
      <div className="grid g2">
        <div className="card">
          <span className="corner tl" />
          <span className="corner br" />
          <div className="row" style={{ marginBottom: 14 }}>
            <IcChat style={{ width: 18, height: 18, color: 'var(--acid)' }} />
            <b>Widget czatu na stronę WWW</b>
            {savedW && <span className="badge ok">Zapisano</span>}
          </div>
          <p className="muted" style={{ marginBottom: 14 }}>
            Wklej jeden skrypt przed <code className="mono">&lt;/body&gt;</code>. Ikona czatu pojawi się w rogu strony
            klienta i rozmawia z doradcą tego projektu.
          </p>
          <div className="row" style={{ marginBottom: 14 }}>
            <label className="f" style={{ margin: 0 }}>
              <span className="mono">Kolor przycisku</span>
              <div className="row">
                <input type="color" value={/^#([0-9a-f]{6})$/i.test(color) ? color : '#B8FF00'} onChange={(e) => { dirtyW.current = true; setColor(e.target.value) }} style={{ width: 46, height: 38, padding: 3 }} />
                <input value={color} onChange={(e) => { dirtyW.current = true; setColor(e.target.value) }} style={{ width: 100 }} />
              </div>
            </label>
            <label className="f" style={{ margin: 0 }}>
              <span className="mono">Kolor ikony</span>
              <div className="row">
                <input type="color" value={/^#([0-9a-f]{6})$/i.test(iconColor) ? iconColor : '#0d0d0d'} onChange={(e) => { dirtyW.current = true; setIconColor(e.target.value) }} style={{ width: 46, height: 38, padding: 3 }} />
                <button type="button" className={`btn sm ${!iconColor ? 'primary' : ''}`} onClick={() => { dirtyW.current = true; setIconColor('') }} title="Automatyczny kontrast do koloru przycisku">
                  Auto
                </button>
              </div>
            </label>
            <label className="f" style={{ margin: 0 }}>
              <span className="mono">Tło okna czatu</span>
              <div className="row">
                <input type="color" value={/^#([0-9a-f]{6})$/i.test(winBg) ? winBg : '#0D0D0D'} onChange={(e) => { dirtyW.current = true; setWinBg(e.target.value) }} style={{ width: 46, height: 38, padding: 3 }} />
                <div className="chips">
                  <button type="button" className={winBg.toLowerCase() === '#0d0d0d' ? 'on' : ''} onClick={() => { dirtyW.current = true; setWinBg('#0D0D0D') }}>
                    Ciemne
                  </button>
                  <button type="button" className={winBg.toLowerCase() === '#f5f5f0' ? 'on' : ''} onClick={() => { dirtyW.current = true; setWinBg('#F5F5F0') }}>
                    Jasne
                  </button>
                </div>
              </div>
            </label>
            <label className="f" style={{ margin: 0 }}>
              <span className="mono">Pozycja</span>
              <div className="chips">
                <button type="button" className={position === 'left' ? 'on' : ''} onClick={() => { dirtyW.current = true; setPosition('left') }}>
                  Lewy róg
                </button>
                <button type="button" className={position === 'right' ? 'on' : ''} onClick={() => { dirtyW.current = true; setPosition('right') }}>
                  Prawy róg
                </button>
              </div>
            </label>
            <button className="btn right" onClick={saveWidget}>
              Zapisz
            </button>
          </div>
          <CodeBox code={embed} />
        </div>

        <div className="card">
          <span className="corner tl" />
          <span className="corner br" />
          <div className="row" style={{ marginBottom: 14 }}>
            <IcWhatsApp style={{ width: 18, height: 18, color: 'var(--acid)' }} />
            <b>Przycisk WhatsApp na stronę</b>
          </div>
          <p className="muted" style={{ marginBottom: 14 }}>
            Ta sama ikona w rogu, ale zamiast czatu otwiera rozmowę WhatsApp z podanym numerem.
          </p>
          <label className="f">
            <span className="mono">Numer WhatsApp (z kodem kraju, bez +)</span>
            <input value={waPhone} onChange={(e) => { dirtyW.current = true; setWaPhone(e.target.value) }} placeholder="48600000000" />
          </label>
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn" onClick={saveWidget}>
              Zapisz numer
            </button>
          </div>
          <CodeBox code={embedWa} />
        </div>
      </div>

      <div className="spacer" />
      <h2 style={{ fontSize: 16, marginBottom: 6 }}>Kanały API — Meta</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Webhook jest gotowy i wspólny dla wszystkich kanałów: <code className="mono">{FN_BASE}/brain-hook</code>.
        Podłącz aplikację Meta Business, wklej tokeny — doradca zacznie odpowiadać w tych kanałach.{' '}
        <span className="badge warn" style={{ verticalAlign: 'middle' }}>Test na żywo — następny etap</span>
      </p>
      <div className="grid g3">
        <MetaChannel
          projId={projId}
          channels={channels}
          refreshChannels={refreshChannels}
          type="facebook"
          icon={<IcFacebook style={{ width: 18, height: 18 }} />}
          title="Facebook Messenger"
          fields={[
            ['page_id', 'ID strony (Page ID)'],
            ['page_token', 'Page Access Token'],
          ]}
          steps={[
            'developers.facebook.com → utwórz aplikację typu Business.',
            'Dodaj produkt „Messenger" i połącz stronę firmy.',
            'Wygeneruj Page Access Token i wklej powyżej.',
            'W sekcji Webhooks podaj URL webhooka i token weryfikacji, subskrybuj pole „messages".',
          ]}
        />
        <MetaChannel
          projId={projId}
          channels={channels}
          refreshChannels={refreshChannels}
          type="instagram"
          icon={<IcInstagram style={{ width: 18, height: 18 }} />}
          title="Instagram DM"
          fields={[
            ['ig_id', 'ID konta Instagram'],
            ['page_id', 'ID powiązanej strony FB'],
            ['page_token', 'Page Access Token'],
          ]}
          steps={[
            'Konto Instagram musi być firmowe i połączone ze stroną FB.',
            'W aplikacji Meta dodaj produkt „Instagram" (Messaging).',
            'Użyj tokenu strony FB powiązanej z kontem.',
            'W Webhooks subskrybuj obiekt „instagram", pole „messages".',
          ]}
        />
        <MetaChannel
          projId={projId}
          channels={channels}
          refreshChannels={refreshChannels}
          type="whatsapp"
          icon={<IcWhatsApp style={{ width: 18, height: 18 }} />}
          title="WhatsApp Business API"
          fields={[
            ['phone_number_id', 'Phone Number ID'],
            ['wa_token', 'Token dostępu (WhatsApp Cloud API)'],
          ]}
          steps={[
            'W aplikacji Meta dodaj produkt „WhatsApp" (Cloud API).',
            'Skopiuj Phone Number ID z panelu WhatsApp → API Setup.',
            'Wygeneruj stały token (System User) i wklej powyżej.',
            'W Webhooks podaj URL webhooka i token weryfikacji, subskrybuj „messages".',
          ]}
        />
      </div>
    </>
  )
}

function MetaChannel({ projId, channels, refreshChannels, type, icon, title, fields, steps }) {
  const existing = channels.find((c) => c.type === type)
  const [cfg, setCfg] = useState(existing?.config || {})
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = useRef(false)
  const cfgKey = JSON.stringify(existing?.config ?? null)

  useEffect(() => {
    if (!dirty.current) setCfg(existing?.config || {})
  }, [existing?.id, cfgKey]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const config = { ...cfg }
    if (!config.verify_token) config.verify_token = crypto.randomUUID().replaceAll('-', '').slice(0, 24)
    if (existing) await api('channels.update', { id: existing.id, config })
    else await api('channels.create', { project_id: projId, type, name: title, config })
    dirty.current = false
    await refreshChannels()
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const connected = existing && fields.every(([k]) => existing.config?.[k])
  return (
    <div className="card meta-card">
      <div className="mc-head">
        <span style={{ color: 'var(--acid)', flexShrink: 0, display: 'grid' }}>{icon}</span>
        <b>{title}</b>
      </div>
      <div className="mc-badges">
        {connected ? <span className="badge acid">Skonfigurowany</span> : <span className="badge">Nieaktywny</span>}
        {saved && <span className="badge ok">Zapisano</span>}
      </div>
      {!open ? (
        <button className="btn sm" onClick={() => setOpen(true)}>
          <IcKey /> {connected ? 'Edytuj połączenie' : 'Połącz'}
        </button>
      ) : (
        <>
          {fields.map(([k, label]) => (
            <label className="f" key={k}>
              <span className="mono">{label}</span>
              <input value={cfg[k] || ''} onChange={(e) => { dirty.current = true; setCfg((c) => ({ ...c, [k]: e.target.value })) }} />
            </label>
          ))}
          <label className="f">
            <span className="mono">Token weryfikacji webhooka</span>
            <input
              value={cfg.verify_token || ''}
              onChange={(e) => { dirty.current = true; setCfg((c) => ({ ...c, verify_token: e.target.value })) }}
              placeholder="zostanie wygenerowany przy zapisie"
            />
          </label>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn primary sm" onClick={save}>
              Zapisz
            </button>
            <button className="btn sm" onClick={() => setOpen(false)}>
              Zwiń
            </button>
          </div>
          <ol style={{ paddingLeft: 18, color: 'var(--dim)', fontSize: 12.5, display: 'grid', gap: 6 }}>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
