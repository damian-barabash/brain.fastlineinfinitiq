// Sprzedawca: AI, który sam pisze do lidów (e-mail / WhatsApp), odpowiada i domyka sprzedaż.
// Zakładki: Lidzi (tabela + import + historia) / Ustawienia (persona, godziny, autopilot) / Kanały (Resend, WhatsApp).
import { useEffect, useRef, useState } from 'react'
import { api, session, salesApi, FN_BASE } from '../lib/api.js'
import { useCached } from '../lib/useCached.js'
import SalesChat from '../components/SalesChat.jsx'
import {
  IcPlus,
  IcTrash,
  IcCheck,
  IcX,
  IcUpload,
  IcMail,
  IcWhatsApp,
  IcSend,
  IcEye,
  IcPause,
  IcPlay,
  IcCopy,
  IcRefresh,
  IcHandoff,
  IcKey,
} from '../components/Icons.jsx'

const STATUS = {
  new: ['Nowy', 'badge'],
  contacted: ['W kontakcie', 'badge acid'],
  replied: ['Odpowiedział', 'badge ok'],
  won: ['Wygrany', 'badge ok'],
  lost: ['Przegrany', 'badge danger'],
  opt_out: ['Wypisany', 'badge danger'],
  handoff: ['Do człowieka', 'badge warn'],
  paused: ['Wstrzymany', 'badge warn'],
}
const TEMPS = { cold: ['Zimny', 'badge'], warm: ['Ciepły', 'badge warn'] }
const DAYS = [
  [1, 'Pn'],
  [2, 'Wt'],
  [3, 'Śr'],
  [4, 'Cz'],
  [5, 'Pt'],
  [6, 'So'],
  [7, 'Nd'],
]

export default function Sales() {
  const proj = session.proj
  const [tab, setTab] = useState('leads')
  const [cfgData, refreshCfg] = useCached('sales.get', { project_id: proj.id })
  const hookKey = cfgData?.config?.hook_key

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {proj.name} // cyfrowy handlowiec
          </div>
          <h1>Sprzedawca</h1>
          <p className="sub">Sam pisze do lidów, odpowiada na ich wiadomości i prowadzi do zakupu.</p>
        </div>
        {cfgData && (
          <div>
            {cfgData.config?.enabled ? (
              <span className="badge acid">Autopilot włączony</span>
            ) : (
              <span className="badge warn">Autopilot wyłączony</span>
            )}
          </div>
        )}
      </div>
      <div className="tabs">
        <button className={tab === 'leads' ? 'on' : ''} onClick={() => setTab('leads')}>
          Lidzi
        </button>
        <button className={tab === 'test' ? 'on' : ''} onClick={() => setTab('test')}>
          Test rozmowy
        </button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          Ustawienia
        </button>
        <button className={tab === 'channels' ? 'on' : ''} onClick={() => setTab('channels')}>
          Kanały
        </button>
      </div>
      {tab === 'leads' && <Leads projId={proj.id} hookKey={hookKey} />}
      {tab === 'test' && <TestChat projId={proj.id} cfgData={cfgData} refreshCfg={refreshCfg} />}
      {tab === 'settings' && <SettingsTab projId={proj.id} cfgData={cfgData} refreshCfg={refreshCfg} />}
      {tab === 'channels' && <Channels projId={proj.id} cfgData={cfgData} refreshCfg={refreshCfg} />}
    </>
  )
}

// ── Test rozmowy ────────────────────────────────────────────────────────────
function TestChat({ projId, cfgData, refreshCfg }) {
  const demoKey = cfgData?.config?.demo_key
  const [linkOk, setLinkOk] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [chatKey, setChatKey] = useState(0) // remount czatu po "Nowa rozmowa"
  const demoUrl = demoKey ? `${window.location.origin}/sdemo?key=${demoKey}` : ''

  async function rotateLink() {
    if (!demoKey || rotating) return
    if (!confirm('Stary link demo natychmiast przestanie działać. Wygenerować nowy?')) return
    setRotating(true)
    try {
      await api('sales.rotateDemo', { project_id: projId })
      await refreshCfg()
    } finally {
      setRotating(false)
    }
  }
  function newChat() {
    try {
      sessionStorage.removeItem(`brain_salestest:${projId}`)
    } catch {
      /* ignore */
    }
    setChatKey((k) => k + 1)
  }

  return (
    <div className="card" style={{ height: '66vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <span className="dot" />
        <span className="mono" style={{ color: 'var(--text)' }}>Symulacja rozmowy — Ty grasz klienta</span>
        <span className="right row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            className="btn sm"
            disabled={!demoKey}
            onClick={() => {
              navigator.clipboard.writeText(demoUrl)
              setLinkOk(true)
              setTimeout(() => setLinkOk(false), 1600)
            }}
            title="Publiczny link demo — wyślij klientowi, otworzy sam czat bez panelu"
          >
            {linkOk ? <IcCheck /> : <IcCopy />} {linkOk ? 'Skopiowano' : 'Kopiuj link demo'}
          </button>
          <a className="btn sm" href={demoUrl || '#'} target="_blank" rel="noreferrer" aria-disabled={!demoKey}>
            <IcEye /> Otwórz
          </a>
          <button className="btn sm danger" disabled={!demoKey || rotating} onClick={rotateLink} title="Unieważnij stary link i wygeneruj nowy">
            <IcKey /> {rotating ? 'Generowanie…' : 'Nowy link'}
          </button>
          <button className="btn sm" onClick={newChat}>
            <IcRefresh /> Nowa rozmowa
          </button>
        </span>
      </div>
      <SalesChat key={chatKey} demoKey={demoKey} storeKey={`brain_salestest:${projId}`} />
    </div>
  )
}

// ── Ustawienia ──────────────────────────────────────────────────────────────
function SettingsTab({ projId, cfgData, refreshCfg }) {
  const [kb] = useCached('kb.list', { project_id: projId })
  const [cfg, setCfg] = useState(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    if (cfgData && !dirty.current) setCfg(cfgData.config || {})
  }, [cfgData])

  function set(k, v) {
    dirty.current = true
    setCfg((c) => ({ ...c, [k]: v }))
    setSaved(false)
  }
  async function save() {
    setBusy(true)
    try {
      await api('sales.set', { project_id: projId, config: cfg })
      dirty.current = false
      setSaved(true)
      refreshCfg()
    } finally {
      setBusy(false)
    }
  }

  if (!cfg) return <p className="muted">Ładowanie…</p>
  const hours = cfg.hours || {}
  const days = hours.days?.length ? hours.days : [1, 2, 3, 4, 5]
  const productIds = cfg.product_ids || []
  const setHours = (k, v) => set('hours', { ...hours, [k]: v })

  return (
    <div className="grid g2">
      <div className="card">
        <span className="corner tl" />
        <span className="corner br" />
        <h3 style={{ marginBottom: 16, fontSize: 14 }}>Persona i styl sprzedaży</h3>
        <label className="f">
          <span className="mono">Imię / nazwa persony</span>
          <input value={cfg.persona || ''} onChange={(e) => set('persona', e.target.value)} placeholder="np. Kacper — opiekun klienta" />
        </label>
        <label className="f">
          <span className="mono">Rola (kim jest, co sprzedaje)</span>
          <textarea value={cfg.role_desc || ''} onChange={(e) => set('role_desc', e.target.value)} placeholder="Kontaktujesz się z potencjalnymi klientami i sprzedajesz szkolenia firmy." />
        </label>
        <label className="f">
          <span className="mono">Temperatura sprzedaży</span>
          <div className="chips">
            {[
              ['delikatna', 'Delikatna'],
              ['zrównoważona', 'Zrównoważona'],
              ['ofensywna', 'Ofensywna'],
            ].map(([k, l]) => (
              <button key={k} type="button" className={(cfg.temperature || 'zrównoważona') === k ? 'on' : ''} onClick={() => set('temperature', k)}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <label className="f">
          <span className="mono">Produkty w ofercie sprzedawcy (puste = wszystkie)</span>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {(kb?.products || []).map((p) => (
              <button
                key={p.id}
                type="button"
                className={productIds.includes(p.id) ? 'on' : ''}
                onClick={() => set('product_ids', productIds.includes(p.id) ? productIds.filter((x) => x !== p.id) : [...productIds, p.id])}
              >
                {p.name}
              </button>
            ))}
          </div>
        </label>
        <label className="f">
          <span className="mono">Dodatkowe zasady (opcjonalnie)</span>
          <textarea value={cfg.rules || ''} onChange={(e) => set('rules', e.target.value)} placeholder="np. Nie oferuj rabatów. Zwracaj się per Pan/Pani." />
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
        <h3 style={{ marginBottom: 16, fontSize: 14 }}>Autopilot</h3>
        <label className="f">
          <span className="mono">Samodzielne pisanie do lidów</span>
          <div className="chips">
            <button type="button" className={cfg.enabled ? 'on' : ''} onClick={() => set('enabled', true)}>
              Włączony
            </button>
            <button type="button" className={!cfg.enabled ? 'on' : ''} onClick={() => set('enabled', false)}>
              Wyłączony
            </button>
          </div>
          <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            Włączony: sprzedawca sam pisze do nowych lidów i wysyła follow-upy — tylko w godzinach poniżej.
          </span>
        </label>
        <div className="fgrid">
          <label className="f">
            <span className="mono">Pisze od godziny</span>
            <select value={hours.from ?? 9} onChange={(e) => setHours('from', Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
          <label className="f">
            <span className="mono">Do godziny</span>
            <select value={hours.to ?? 17} onChange={(e) => setHours('to', Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h + 1}>{String(h + 1).padStart(2, '0')}:00</option>
              ))}
            </select>
          </label>
        </div>
        <label className="f">
          <span className="mono">Dni tygodnia</span>
          <div className="chips">
            {DAYS.map(([d, l]) => (
              <button key={d} type="button" className={days.includes(d) ? 'on' : ''} onClick={() => setHours('days', days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}>
                {l}
              </button>
            ))}
          </div>
        </label>
        <div className="fgrid">
          <label className="f">
            <span className="mono">Limit dzienny wiadomości</span>
            <input type="number" min="1" max="200" value={cfg.daily_limit ?? 20} onChange={(e) => set('daily_limit', Number(e.target.value) || 20)} />
          </label>
          <label className="f">
            <span className="mono">Follow-up co (dni)</span>
            <input type="number" min="1" max="30" value={cfg.followup_days ?? 3} onChange={(e) => set('followup_days', Number(e.target.value) || 3)} />
          </label>
          <label className="f">
            <span className="mono">Maks. prób kontaktu</span>
            <input type="number" min="1" max="10" value={cfg.max_followups ?? 3} onChange={(e) => set('max_followups', Number(e.target.value) || 3)} />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Strefa czasowa: Europe/Warsaw. Klient odpisuje → AI odpowiada od razu (o każdej porze) i prowadzi rozmowę aż do
          sprzedaży, przekazania człowiekowi albo zamknięcia. Wiadomość „STOP" wypisuje leada na stałe.
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz ustawienia'}
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

// ── Kanały ──────────────────────────────────────────────────────────────────
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

function Channels({ projId, cfgData, refreshCfg }) {
  const [cfg, setCfg] = useState(null)
  const [saved, setSaved] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testRes, setTestRes] = useState(null)
  const dirty = useRef(false)

  useEffect(() => {
    if (cfgData && !dirty.current) setCfg(cfgData.config || {})
  }, [cfgData])

  if (!cfg) return <p className="muted">Ładowanie…</p>
  const email = cfg.email || {}
  const wa = cfg.whatsapp || {}
  const channels = cfg.channels || { email: true }
  const hook = cfg.hook_key || ''
  const setEmail = (k, v) => {
    dirty.current = true
    setCfg((c) => ({ ...c, email: { ...(c.email || {}), [k]: v } }))
    setSaved(false)
  }
  const setWa = (k, v) => {
    dirty.current = true
    setCfg((c) => ({ ...c, whatsapp: { ...(c.whatsapp || {}), [k]: v } }))
    setSaved(false)
  }
  const setChan = (k, v) => {
    dirty.current = true
    setCfg((c) => ({ ...c, channels: { ...(c.channels || {}), [k]: v } }))
    setSaved(false)
  }

  async function save() {
    const next = { ...cfg }
    if (!next.whatsapp?.verify_token && (next.whatsapp?.phone_number_id || next.whatsapp?.wa_token)) {
      next.whatsapp = { ...next.whatsapp, verify_token: crypto.randomUUID().replaceAll('-', '').slice(0, 24) }
      setCfg(next)
    }
    await api('sales.set', { project_id: projId, config: next })
    dirty.current = false
    setSaved(true)
    refreshCfg()
  }
  async function sendTest() {
    setTestRes(null)
    try {
      await salesApi(hook, 'test', { to: testTo.trim() })
      setTestRes({ ok: true })
    } catch (e) {
      setTestRes({ ok: false, error: e.message })
    }
  }

  return (
    <>
      <div className="grid g2">
        <div className="card">
          <span className="corner tl" />
          <span className="corner br" />
          <div className="row" style={{ marginBottom: 12 }}>
            <IcMail style={{ width: 18, height: 18, color: 'var(--acid)' }} />
            <b>E-mail (Resend)</b>
            <span className="right row" style={{ gap: 6 }}>
              {email.resend_key && email.from_email ? <span className="badge acid">Skonfigurowany</span> : <span className="badge">Nieaktywny</span>}
            </span>
          </div>
          <label className="f">
            <span className="mono">Kanał e-mail</span>
            <div className="chips">
              <button type="button" className={channels.email !== false ? 'on' : ''} onClick={() => setChan('email', true)}>
                Włączony
              </button>
              <button type="button" className={channels.email === false ? 'on' : ''} onClick={() => setChan('email', false)}>
                Wyłączony
              </button>
            </div>
          </label>
          <label className="f">
            <span className="mono">Klucz API Resend</span>
            <input type="password" value={email.resend_key || ''} onChange={(e) => setEmail('resend_key', e.target.value)} placeholder="re_…" autoComplete="off" />
          </label>
          <div className="fgrid">
            <label className="f">
              <span className="mono">Nazwa nadawcy</span>
              <input value={email.from_name || ''} onChange={(e) => setEmail('from_name', e.target.value)} placeholder="Kacper z FIQ" />
            </label>
            <label className="f">
              <span className="mono">Adres nadawcy (zweryfikowana domena)</span>
              <input value={email.from_email || ''} onChange={(e) => setEmail('from_email', e.target.value)} placeholder="kacper@twojafirma.pl" />
            </label>
          </div>
          <label className="f">
            <span className="mono">Adres na odpowiedzi (reply-to — tu wracają maile klientów)</span>
            <input value={email.reply_to || ''} onChange={(e) => setEmail('reply_to', e.target.value)} placeholder="oferty@twojafirma.pl" />
          </label>
          <label className="f">
            <span className="mono">Podpis (opcjonalnie)</span>
            <input value={email.signature || ''} onChange={(e) => setEmail('signature', e.target.value)} placeholder="Kacper Nowak, Twoja Firma, +48 …" />
          </label>
          <label className="f">
            <span className="mono">Stopka z możliwością wypisania się (RODO)</span>
            <div className="chips">
              <button type="button" className={email.footer_optout !== false ? 'on' : ''} onClick={() => setEmail('footer_optout', true)}>
                Dodawaj
              </button>
              <button type="button" className={email.footer_optout === false ? 'on' : ''} onClick={() => setEmail('footer_optout', false)}>
                Bez stopki
              </button>
            </div>
          </label>
          <div className="row" style={{ marginBottom: 12 }}>
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="twój@email.pl" style={{ maxWidth: 220 }} />
            <button className="btn sm" onClick={sendTest} disabled={!testTo.trim() || !hook}>
              <IcSend /> Wyślij test
            </button>
            {testRes?.ok && <span className="badge ok">Wysłano</span>}
            {testRes && !testRes.ok && <span className="badge danger">{testRes.error}</span>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <b>Odbieranie odpowiedzi:</b> w Resend dodaj Inbound (odbieranie poczty na Twojej domenie), a jako webhook
            zdarzenia <code className="mono">email.received</code> wklej adres poniżej. Adres „reply-to" ustaw na skrzynkę
            obsługiwaną przez Resend Inbound — wtedy każda odpowiedź klienta trafia do AI i historia rozmowy zapisuje się sama.
          </p>
          <CodeBox code={`${FN_BASE}/brain-sales?hook=email&key=${hook}`} />
        </div>

        <div className="card">
          <span className="corner tl" />
          <span className="corner br" />
          <div className="row" style={{ marginBottom: 12 }}>
            <IcWhatsApp style={{ width: 18, height: 18, color: 'var(--acid)' }} />
            <b>WhatsApp (Cloud API)</b>
            <span className="right row" style={{ gap: 6 }}>
              {wa.phone_number_id && wa.wa_token ? <span className="badge acid">Skonfigurowany</span> : <span className="badge">Nieaktywny</span>}
            </span>
          </div>
          <label className="f">
            <span className="mono">Kanał WhatsApp</span>
            <div className="chips">
              <button type="button" className={channels.whatsapp ? 'on' : ''} onClick={() => setChan('whatsapp', true)}>
                Włączony
              </button>
              <button type="button" className={!channels.whatsapp ? 'on' : ''} onClick={() => setChan('whatsapp', false)}>
                Wyłączony
              </button>
            </div>
          </label>
          <div className="fgrid">
            <label className="f">
              <span className="mono">Phone Number ID</span>
              <input value={wa.phone_number_id || ''} onChange={(e) => setWa('phone_number_id', e.target.value)} />
            </label>
            <label className="f">
              <span className="mono">Token dostępu (System User)</span>
              <input type="password" value={wa.wa_token || ''} onChange={(e) => setWa('wa_token', e.target.value)} autoComplete="off" />
            </label>
          </div>
          <div className="fgrid">
            <label className="f">
              <span className="mono">Szablon pierwszego kontaktu</span>
              <input value={wa.template_name || ''} onChange={(e) => setWa('template_name', e.target.value)} placeholder="np. pierwszy_kontakt" />
            </label>
            <label className="f">
              <span className="mono">Język szablonu</span>
              <input value={wa.template_lang || 'pl'} onChange={(e) => setWa('template_lang', e.target.value)} />
            </label>
          </div>
          <label className="f">
            <span className="mono">Token weryfikacji webhooka</span>
            <input value={wa.verify_token || ''} onChange={(e) => setWa('verify_token', e.target.value)} placeholder="zostanie wygenerowany przy zapisie" />
          </label>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <b>Ważne:</b> WhatsApp pozwala firmie rozpocząć rozmowę wyłącznie zatwierdzonym szablonem Meta — pierwszy
            kontakt z zimnym leadem to Twój szablon, a po odpowiedzi klienta AI pisze już swobodnie (okno 24h). Webhook
            poniżej wklej w aplikacji Meta (subskrybuj pole „messages").
          </p>
          <CodeBox code={`${FN_BASE}/brain-sales?hook=wa&key=${hook}`} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={save}>
          Zapisz kanały
        </button>
        {saved && (
          <span className="badge ok">
            <IcCheck style={{ width: 11, height: 11 }} /> Zapisano
          </span>
        )}
      </div>
    </>
  )
}

// ── Lidzi ───────────────────────────────────────────────────────────────────
function Leads({ projId, hookKey }) {
  const [data, refetch] = useCached('leads.list', { project_id: projId })
  const [leads, setLeads] = useState(null)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState(null)
  const [modal, setModal] = useState(null) // 'add' | 'import'

  useEffect(() => {
    if (data) setLeads(data.leads)
  }, [data])

  if (!leads) return <p className="muted">Ładowanie…</p>
  const shown = leads.filter((l) => {
    if (filter && l.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return [l.name, l.email, l.phone, l.company].some((v) => v?.toLowerCase().includes(q))
    }
    return true
  })
  const counts = {}
  for (const l of leads) counts[l.status] = (counts[l.status] || 0) + 1

  return (
    <>
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>
            Wszyscy ({leads.length})
          </button>
          {Object.entries(STATUS).map(([k, [label]]) =>
            counts[k] ? (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(filter === k ? '' : k)}>
                {label} ({counts[k]})
              </button>
            ) : null,
          )}
        </div>
        <span className="right row" style={{ gap: 8 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj…" style={{ width: 160 }} />
          <button className="btn sm" onClick={() => setModal('import')}>
            <IcUpload /> Import
          </button>
          <button className="btn sm primary" onClick={() => setModal('add')}>
            <IcPlus /> Dodaj leada
          </button>
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(300px,1fr) minmax(340px,1.1fr)' : '1fr' }}>
        <div className="card" style={{ padding: 0, overflowX: 'auto', alignSelf: 'start' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Kontakt</th>
                <th>Temp.</th>
                <th>Status</th>
                <th>Próby</th>
                <th>Ostatnio</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} onClick={() => setSel(l)} style={{ cursor: 'pointer', background: sel?.id === l.id ? 'rgba(184,255,0,.05)' : undefined }}>
                  <td>
                    {l.unread && <span className="dot" style={{ marginRight: 6 }} />}
                    <b style={{ fontSize: 13 }}>{l.name || l.email || l.phone}</b>
                    {l.company && <div className="mono" style={{ fontSize: 10 }}>{l.company}</div>}
                  </td>
                  <td className="mono" style={{ fontSize: 10.5 }}>
                    {l.email && <div>{l.email}</div>}
                    {l.phone && <div>{l.phone}</div>}
                  </td>
                  <td>
                    <span className={TEMPS[l.temp]?.[1] || 'badge'}>{TEMPS[l.temp]?.[0] || l.temp}</span>
                  </td>
                  <td>
                    <span className={STATUS[l.status]?.[1] || 'badge'}>{STATUS[l.status]?.[0] || l.status}</span>
                  </td>
                  <td className="mono">{l.attempts}</td>
                  <td className="mono" style={{ fontSize: 10.5 }}>
                    {l.last_out_at || l.last_in_at
                      ? new Date(Math.max(new Date(l.last_out_at || 0), new Date(l.last_in_at || 0))).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
                      : '—'}
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 24 }}>
                    {leads.length ? 'Brak lidów dla tego filtra.' : 'Brak lidów. Dodaj ręcznie albo zaimportuj plik (CSV, Excel, JSON, vCard).'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sel && (
          <LeadPanel
            lead={leads.find((l) => l.id === sel.id) || sel}
            hookKey={hookKey}
            onClose={() => setSel(null)}
            onChanged={(patch) => {
              if (patch === 'deleted') {
                setSel(null)
                refetch()
              } else if (patch) {
                setLeads((ls) => ls.map((l) => (l.id === sel.id ? { ...l, ...patch } : l)))
              } else refetch()
            }}
          />
        )}
      </div>

      {modal === 'add' && <AddLeadModal projId={projId} onClose={() => setModal(null)} onDone={() => { setModal(null); refetch() }} />}
      {modal === 'import' && <ImportModal projId={projId} onClose={() => setModal(null)} onDone={() => { setModal(null); refetch() }} />}
    </>
  )
}

// ── panel leada: dane + historia + akcje ────────────────────────────────────
function LeadPanel({ lead, hookKey, onClose, onChanged }) {
  const [msgs, setMsgs] = useState(null)
  const [preview, setPreview] = useState(null) // {subject, body, channel} | 'loading'
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState(lead.notes || '')

  useEffect(() => {
    setMsgs(null)
    setPreview(null)
    setErr('')
    setNotes(lead.notes || '')
    api('lead.messages', { lead_id: lead.id }).then((d) => {
      setMsgs(d.messages)
      if (lead.unread) onChanged({ unread: false })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  async function setStatus(status) {
    await api('leads.update', { id: lead.id, status })
    onChanged({ status })
  }
  async function saveNotes() {
    await api('leads.update', { id: lead.id, notes })
    onChanged({ notes })
  }
  async function del() {
    if (!confirm('Usunąć leada wraz z całą historią?')) return
    await api('leads.delete', { id: lead.id })
    onChanged('deleted')
  }
  async function doPreview() {
    setErr('')
    setPreview('loading')
    try {
      setPreview(await salesApi(hookKey, 'preview', { lead_id: lead.id }))
    } catch (e) {
      setPreview(null)
      setErr(e.message)
    }
  }
  async function sendNow() {
    setErr('')
    setBusy('send')
    try {
      await salesApi(hookKey, 'send', { lead_id: lead.id })
      setPreview(null)
      const d = await api('lead.messages', { lead_id: lead.id })
      setMsgs(d.messages)
      onChanged()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const closed = ['won', 'lost', 'opt_out'].includes(lead.status)
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '76vh', alignSelf: 'start' }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <b>{lead.name || lead.email || lead.phone}</b>
        <span className={STATUS[lead.status]?.[1] || 'badge'}>{STATUS[lead.status]?.[0]}</span>
        <span className="right row" style={{ gap: 4 }}>
          <button className="btn sm danger" onClick={del} title="Usuń leada">
            <IcTrash />
          </button>
          <button className="btn sm" onClick={onClose}>
            <IcX />
          </button>
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10.5, marginBottom: 10, color: 'var(--dim)' }}>
        {[lead.email, lead.phone, lead.company].filter(Boolean).join(' • ')}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {!closed && (
          <>
            <button className="btn sm" onClick={doPreview} disabled={preview === 'loading'} title="Zobacz, co AI napisze — bez wysyłki">
              <IcEye /> {preview === 'loading' ? 'Generowanie…' : 'Podgląd'}
            </button>
            <button className="btn sm primary" onClick={sendNow} disabled={busy === 'send'} title="Wygeneruj i wyślij od razu">
              <IcSend /> {busy === 'send' ? 'Wysyłanie…' : 'Wyślij teraz'}
            </button>
            {lead.status !== 'paused' ? (
              <button className="btn sm" onClick={() => setStatus('paused')} title="Autopilot pominie tego leada">
                <IcPause /> Wstrzymaj
              </button>
            ) : (
              <button className="btn sm" onClick={() => setStatus(lead.attempts ? 'contacted' : 'new')}>
                <IcPlay /> Wznów
              </button>
            )}
            <button className="btn sm" onClick={() => setStatus('handoff')} title="Oznacz: przejmuje człowiek">
              <IcHandoff /> Przejmuję
            </button>
          </>
        )}
        {lead.status !== 'won' && (
          <button className="btn sm" onClick={() => setStatus('won')} style={{ color: 'var(--ok)' }}>
            <IcCheck /> Wygrany
          </button>
        )}
        {lead.status !== 'lost' && (
          <button className="btn sm" onClick={() => setStatus('lost')}>
            <IcX /> Przegrany
          </button>
        )}
        {closed && (
          <button className="btn sm" onClick={() => setStatus(lead.attempts ? 'contacted' : 'new')} title="Otwórz ponownie">
            <IcRefresh /> Otwórz ponownie
          </button>
        )}
      </div>
      {err && <p className="err" style={{ marginBottom: 8 }}>{err}</p>}
      {preview && preview !== 'loading' && (
        <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--acid)' }}>
          <div className="mono" style={{ fontSize: 10, marginBottom: 6 }}>
            PODGLĄD ({preview.channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}) — jeszcze nie wysłane
          </div>
          {preview.subject && <b style={{ fontSize: 12.5, display: 'block', marginBottom: 6 }}>{preview.subject}</b>}
          <p style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{preview.body}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm primary" onClick={sendNow} disabled={busy === 'send'}>
              <IcSend /> {busy === 'send' ? 'Wysyłanie…' : 'Wyślij'}
            </button>
            <button className="btn sm" onClick={() => setPreview(null)}>
              Odrzuć
            </button>
          </div>
        </div>
      )}
      <div style={{ overflowY: 'auto', display: 'grid', gap: 8, flex: 1, minHeight: 120 }}>
        {msgs === null && <p className="muted">Ładowanie historii…</p>}
        {msgs?.length === 0 && <p className="muted">Brak korespondencji. „Podgląd" pokaże pierwszą wiadomość, „Wyślij teraz" — wyśle ją.</p>}
        {msgs?.map((m) => (
          <div key={m.id} className="lm" data-dir={m.direction}>
            <div className="mono" style={{ fontSize: 9.5, marginBottom: 4, display: 'flex', gap: 8 }}>
              <span>{m.direction === 'out' ? 'AI →' : '← KLIENT'}</span>
              <span>{m.channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}</span>
              <span>{new Date(m.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
              {m.status === 'failed' && <span style={{ color: 'var(--danger)' }}>BŁĄD: {m.meta?.error}</span>}
            </div>
            {m.subject && <b style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{m.subject}</b>}
            <p style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{m.content}</p>
          </div>
        ))}
      </div>
      <label className="f" style={{ marginTop: 12, marginBottom: 0 }}>
        <span className="mono">Notatki (AI bierze je pod uwagę)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} style={{ minHeight: 48 }} placeholder="np. poznany na targach, interesował go pakiet PRO" />
      </label>
    </div>
  )
}

// ── dodawanie ręczne ────────────────────────────────────────────────────────
function AddLeadModal({ projId, onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', temp: 'cold', channel: 'email', notes: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function save() {
    if (!f.email.trim() && !f.phone.trim()) {
      setErr('Lead musi mieć e-mail albo numer telefonu.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await api('leads.create', { project_id: projId, ...f })
      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Nowy lead</h2>
        <div className="fgrid">
          <label className="f">
            <span className="mono">Imię i nazwisko</span>
            <input value={f.name} onChange={set('name')} />
          </label>
          <label className="f">
            <span className="mono">Firma</span>
            <input value={f.company} onChange={set('company')} />
          </label>
          <label className="f">
            <span className="mono">E-mail</span>
            <input value={f.email} onChange={set('email')} />
          </label>
          <label className="f">
            <span className="mono">Telefon (WhatsApp)</span>
            <input value={f.phone} onChange={set('phone')} placeholder="+48 …" />
          </label>
          <label className="f">
            <span className="mono">Temperatura</span>
            <select value={f.temp} onChange={set('temp')}>
              <option value="cold">Zimny — nie zna firmy</option>
              <option value="warm">Ciepły — miał kontakt</option>
            </select>
          </label>
          <label className="f">
            <span className="mono">Preferowany kanał</span>
            <select value={f.channel} onChange={set('channel')}>
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
        </div>
        <label className="f">
          <span className="mono">Notatki dla AI (opcjonalnie)</span>
          <textarea value={f.notes} onChange={set('notes')} style={{ minHeight: 60 }} />
        </label>
        {err && <p className="err">{err}</p>}
        <div className="acts">
          <button className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Dodaj'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── import plików: CSV / TSV / Excel / JSON / vCard ─────────────────────────
const FIELD_OPTS = [
  ['skip', '— pomiń —'],
  ['name', 'Imię i nazwisko'],
  ['email', 'E-mail'],
  ['phone', 'Telefon'],
  ['company', 'Firma'],
  ['notes', 'Notatki'],
]

function autoMap(header) {
  const h = String(header).toLowerCase()
  if (/mail/.test(h)) return 'email'
  if (/tel|phone|komórk|numer/.test(h)) return 'phone'
  if (/firma|company|organiz/.test(h)) return 'company'
  if (/imi|name|osoba|klient|kontakt/.test(h)) return 'name'
  if (/notat|note|uwag|komentarz/.test(h)) return 'notes'
  return 'skip'
}

function parseCsv(text) {
  // delimiter: tab > średnik > przecinek (po pierwszej linii), cudzysłowy obsłużone
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || text.length)
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === delim) {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  if (cur !== '' || row.length) {
    row.push(cur)
    if (row.some((v) => v.trim() !== '')) rows.push(row)
  }
  return rows
}

function parseVcf(text) {
  const rows = [['name', 'email', 'phone', 'company']]
  for (const card of text.split(/BEGIN:VCARD/i).slice(1)) {
    const g = (re) => card.match(re)?.[1]?.trim() ?? ''
    rows.push([
      g(/^FN[^:]*:(.+)$/im),
      g(/^EMAIL[^:]*:(.+)$/im),
      g(/^TEL[^:]*:(.+)$/im),
      g(/^ORG[^:]*:(.+)$/im).replace(/;+$/, ''),
    ])
  }
  return rows
}

function ImportModal({ projId, onClose, onDone }) {
  const [grid, setGrid] = useState(null) // {headers, rows}
  const [map, setMap] = useState([])
  const [hasHeader, setHasHeader] = useState(true)
  const [temp, setTemp] = useState('cold')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    setResult(null)
    try {
      const name = file.name.toLowerCase()
      let rows = []
      if (/\.(xlsx|xls|ods)$/.test(name)) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }).map((r) => r.map((v) => String(v ?? '')))
      } else if (/\.json$/.test(name)) {
        const arr = JSON.parse(await file.text())
        if (!Array.isArray(arr) || !arr.length) throw new Error('JSON musi być tablicą obiektów')
        const headers = [...new Set(arr.flatMap((o) => Object.keys(o)))]
        rows = [headers, ...arr.map((o) => headers.map((h) => String(o[h] ?? '')))]
      } else if (/\.vcf$/.test(name)) {
        rows = parseVcf(await file.text())
      } else {
        rows = parseCsv(await file.text())
      }
      rows = rows.filter((r) => r.some((v) => String(v).trim() !== ''))
      if (rows.length < 1) throw new Error('Plik jest pusty')
      const width = Math.max(...rows.map((r) => r.length))
      rows = rows.map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? '').trim()))
      const looksHeader = !rows[0].some((v) => /@/.test(v)) // wiersz z e-mailem to już dane
      setHasHeader(looksHeader)
      setGrid({ headers: rows[0], rows })
      setMap(rows[0].map((h, i) => (looksHeader ? autoMap(h) : autoMap('') === 'skip' && i === 0 ? 'name' : autoMap(String(rows[0][i])))))
    } catch (ex) {
      setErr(ex.message || 'Nie udało się odczytać pliku')
      setGrid(null)
    }
  }

  const dataRows = grid ? (hasHeader ? grid.rows.slice(1) : grid.rows) : []
  const mappedCount = dataRows.filter((r) => {
    const e = map.indexOf('email')
    const p = map.indexOf('phone')
    return (e >= 0 && r[e]) || (p >= 0 && r[p])
  }).length

  async function doImport() {
    setBusy(true)
    setErr('')
    try {
      const rows = dataRows
        .map((r) => {
          const o = { temp }
          map.forEach((field, i) => {
            if (field !== 'skip' && r[i]) o[field] = o[field] ? `${o[field]} ${r[i]}` : r[i]
          })
          return o
        })
        .filter((o) => o.email || o.phone)
      const res = await api('leads.import', { project_id: projId, rows })
      setResult(res)
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <h2>Import lidów</h2>
        {!grid && (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              Wrzuć plik z kontaktami — CSV, TSV, Excel (xlsx/xls), JSON albo vCard (vcf). Kolumny dopasujesz w następnym
              kroku, duplikaty zostaną pominięte automatycznie.
            </p>
            <label className="f">
              <span className="mono">Plik</span>
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.json,.vcf" onChange={onFile} />
            </label>
          </>
        )}
        {grid && !result && (
          <>
            <div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="chips">
                <button className={hasHeader ? 'on' : ''} onClick={() => setHasHeader(true)}>
                  Pierwszy wiersz to nagłówki
                </button>
                <button className={!hasHeader ? 'on' : ''} onClick={() => setHasHeader(false)}>
                  Od razu dane
                </button>
              </div>
              <div className="chips">
                <button className={temp === 'cold' ? 'on' : ''} onClick={() => setTemp('cold')}>
                  Zimni
                </button>
                <button className={temp === 'warm' ? 'on' : ''} onClick={() => setTemp('warm')}>
                  Ciepli
                </button>
              </div>
              <span className="badge right">{mappedCount} / {dataRows.length} z kontaktem</span>
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    {grid.headers.map((h, i) => (
                      <th key={i} style={{ minWidth: 130 }}>
                        <select value={map[i] || 'skip'} onChange={(e) => setMap((m) => m.map((v, j) => (j === i ? e.target.value : v)))} style={{ padding: '6px 8px', fontSize: 11 }}>
                          {FIELD_OPTS.map(([k, l]) => (
                            <option key={k} value={k}>{l}</option>
                          ))}
                        </select>
                        {hasHeader && <div className="mono" style={{ fontSize: 9.5, marginTop: 4 }}>{h}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j} style={{ fontSize: 11.5, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dataRows.length > 5 && <p className="muted" style={{ fontSize: 11.5 }}>…i {dataRows.length - 5} kolejnych wierszy.</p>}
          </>
        )}
        {result && (
          <p style={{ marginBottom: 12 }}>
            <span className="badge ok" style={{ marginRight: 8 }}>Dodano: {result.added}</span>
            {result.skipped > 0 && <span className="badge warn">Pominięto duplikaty: {result.skipped}</span>}
          </p>
        )}
        {err && <p className="err">{err}</p>}
        <div className="acts">
          <button className="btn" onClick={result ? onDone : onClose}>
            {result ? 'Zamknij' : 'Anuluj'}
          </button>
          {grid && !result && (
            <button className="btn primary" onClick={doImport} disabled={busy || !mappedCount}>
              {busy ? 'Importowanie…' : `Importuj ${mappedCount} lidów`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
