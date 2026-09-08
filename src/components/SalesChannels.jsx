// Kanały sprzedawcy (Resend / WhatsApp / telefon ElevenLabs) — wyniesione
// z zakładki „Sprzedawca → Kanały" na stronę Integracje, żeby wszystkie
// integracje produktu były w jednym miejscu (klucze wspólne platformy
// zostają wyłącznie w panelu admina).
import { useEffect, useRef, useState } from 'react'
import { api, salesApi, FN_BASE } from '../lib/api.js'
import { IcCheck, IcCopy, IcMail, IcPhone, IcSend, IcWhatsApp } from '../components/Icons.jsx'
import { SkelPage } from '../shared/Skeleton.jsx'
import ProjectEmail from '../shared/ProjectEmail.jsx'

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

export default function SalesChannels({ projId, cfgData, refreshCfg }) {
  const [cfg, setCfg] = useState(null)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testRes, setTestRes] = useState(null)
  const [testPhone, setTestPhone] = useState('')
  const [voiceRes, setVoiceRes] = useState(null)
  const dirty = useRef(false)

  useEffect(() => {
    if (cfgData && !dirty.current) setCfg(cfgData.config || {})
  }, [cfgData])

  if (!cfg) return <SkelPage head={false} cards={2} />
  const email = cfg.email || {}
  const wa = cfg.whatsapp || {}
  const voice = cfg.voice || {}
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
  const setVoice = (k, v) => {
    dirty.current = true
    setCfg((c) => ({ ...c, voice: { ...(c.voice || {}), [k]: v } }))
    setSaved(false)
  }
  async function voiceAction(action, payload) {
    setVoiceRes(null)
    try {
      const r = await salesApi(hook, action, payload)
      setVoiceRes({ ok: true, text: action === 'voice.sync' ? `Agent zaktualizowany (${r.chars} znaków promptu)` : 'Zlecono połączenie' })
    } catch (e) {
      setVoiceRes({ ok: false, text: e.message })
    }
  }

  async function save() {
    const next = { ...cfg }
    if (!next.whatsapp?.verify_token && (next.whatsapp?.phone_number_id || next.whatsapp?.wa_token)) {
      next.whatsapp = { ...next.whatsapp, verify_token: crypto.randomUUID().replaceAll('-', '').slice(0, 24) }
      setCfg(next)
    }
    setErr('')
    try {
      await api('sales.set', { project_id: projId, config: next })
      dirty.current = false
      setSaved(true)
      refreshCfg()
    } catch (e) {
      setErr(e.message || 'Nie udało się zapisać kanałów')
    }
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
            <b>Wysyłka e-mail sprzedawcy</b>
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
          {/* Adres nadawcy, klucz i podpis są WSPÓLNE dla projektu — ten sam komponent
              stoi w AI Łowcy Leadów, więc konfiguracja z jednego produktu działa we
              wszystkich. Tutaj zostają tylko ustawienia sprzedawcy. */}
          <ProjectEmail
            projectId={projId}
            note="Adres, z którego pisze AI Sprzedawca."
          />
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

        <div className="card">
          <span className="corner tl" />
          <span className="corner br" />
          <div className="row" style={{ marginBottom: 12 }}>
            <IcPhone style={{ width: 18, height: 18, color: 'var(--acid)' }} />
            <b>Telefon (ElevenLabs)</b>
            <span className="right row" style={{ gap: 6 }}>
              {voice.agent_id && voice.phone_id ? <span className="badge acid">Skonfigurowany</span> : <span className="badge">Nieaktywny</span>}
            </span>
          </div>
          <label className="f">
            <span className="mono">Rozmowy telefoniczne</span>
            <div className="chips">
              <button type="button" className={voice.enabled ? 'on' : ''} onClick={() => setVoice('enabled', true)}>
                Włączone
              </button>
              <button type="button" className={!voice.enabled ? 'on' : ''} onClick={() => setVoice('enabled', false)}>
                Wyłączone
              </button>
            </div>
          </label>
          <div className="fgrid">
            <label className="f">
              <span className="mono">ID agenta (ElevenLabs)</span>
              <input value={voice.agent_id || ''} onChange={(e) => setVoice('agent_id', e.target.value.trim())} placeholder="agent_..." />
            </label>
            <label className="f">
              <span className="mono">ID numeru agenta</span>
              <input value={voice.phone_id || ''} onChange={(e) => setVoice('phone_id', e.target.value.trim())} placeholder="phnum_..." />
            </label>
          </div>
          <div className="fgrid">
            <label className="f">
              <span className="mono">Klucz API ElevenLabs (tego projektu)</span>
              <input
                type="password"
                value={voice.api_key || ''}
                onChange={(e) => setVoice('api_key', e.target.value.trim())}
                autoComplete="off"
                placeholder="sk_… — osobne konto na klienta"
              />
            </label>
            <label className="f">
              <span className="mono">Sekret podpisu webhooka</span>
              <input type="password" value={voice.webhook_secret || ''} onChange={(e) => setVoice('webhook_secret', e.target.value)} autoComplete="off" />
            </label>
          </div>
          <label className="f">
            <span className="mono">Pierwsze zdanie agenta</span>
            <input
              value={voice.first_message || ''}
              onChange={(e) => setVoice('first_message', e.target.value)}
              placeholder="Dzień dobry, z tej strony…"
            />
          </label>
          <label className="f">
            <span className="mono">Po rozmowie wysyłać link do zakupu</span>
            <div className="chips">
              <button type="button" className={voice.send_link !== false ? 'on' : ''} onClick={() => setVoice('send_link', true)}>
                Tak
              </button>
              <button type="button" className={voice.send_link === false ? 'on' : ''} onClick={() => setVoice('send_link', false)}>
                Nie
              </button>
            </div>
          </label>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            Agent dzwoni do lidów z kanałem „telefon" i odbiera połączenia przychodzące. Po każdej rozmowie zapisujemy
            transkrypcję w historii leada, ustawiamy status i — jeśli klient prosił o ofertę — wysyłamy link do zakupu
            e-mailem albo WhatsAppem. Prompt agenta buduje się z Bazy wiedzy: po jej zmianie kliknij „Synchronizuj agenta".
          </p>
          <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => voiceAction('voice.sync', {})} disabled={!voice.agent_id}>
              Synchronizuj agenta
            </button>
            <input
              style={{ maxWidth: 190 }}
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+48 600 000 000"
            />
            <button className="btn" onClick={() => voiceAction('voice.test', { to: testPhone })} disabled={!testPhone || !voice.phone_id}>
              Zadzwoń testowo
            </button>
            {voiceRes && <span className={voiceRes.ok ? 'badge ok' : 'badge danger'}>{voiceRes.text}</span>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
            <b>Webhook po rozmowie:</b> wklej ten adres w ElevenLabs (Post-call webhook) — bez niego nie zapiszemy
            transkrypcji ani nie wyślemy linku po rozmowie.
          </p>
          <CodeBox code={`${FN_BASE}/brain-sales?hook=voice&key=${hook}`} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={save}>
          Zapisz kanały
        </button>
        {err && <span className="badge danger">{err}</span>}
        {saved && (
          <span className="badge ok">
            <IcCheck style={{ width: 11, height: 11 }} /> Zapisano
          </span>
        )}
      </div>
    </>
  )
}
