// Wszystkie integracje produktu w jednym miejscu:
//  1) kanały doradcy — widget na stronie, WhatsApp, Instagram, Messenger,
//  2) kanały sprzedawcy — Resend, WhatsApp Cloud, telefon (ElevenLabs).
// Klucze wspólne dla całej platformy (model AI, Unipile, Google Places) NIE są tutaj —
// ustawia je administrator w Admin → Integracje, raz dla wszystkich produktów.
import { useState, useEffect, useRef } from 'react'
import { FN_BASE, PANEL_ORIGIN, api, session } from '../lib/api.js'
import { useCached } from '../lib/useCached.js'
import {
  IcChat,
  IcCheck,
  IcCopy,
  IcFacebook,
  IcInstagram,
  IcKey,
  IcWhatsApp,
} from '../components/Icons.jsx'
import { SkelPage } from '../shared/Skeleton.jsx'
import SalesChannels from '../components/SalesChannels.jsx'

export default function IntegrationsPage() {
  const proj = session.proj
  const [chData, refreshChannels] = useCached('channels.list', { project_id: proj.id })
  const [cfgData, refreshCfg] = useCached('sales.get', { project_id: proj.id })
  const channels = chData?.channels ?? null

  // Integracje należą do produktu: doradca ma widget i kanały Meta, sprzedawca
  // swoje kanały wysyłki. Kontekst wyznacza wybrany produkt (też dla admina).
  const productName = session.product?.name ?? 'AI Doradca'
  const isAdvisor = session.product?.key !== 'sales'
  const isSales = session.product?.key === 'sales'
  const both = false
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {proj.name} // kanały
          </div>
          <h1>Integracje</h1>
          <p className="sub">
            {both ? 'Wszystkie kanały tego projektu — doradcy i sprzedawcy.'
                  : `Kanały tego projektu dla produktu ${productName}.`}
          </p>
        </div>
      </div>

      {isAdvisor && (
        <>
          <div className="mono" style={{ opacity: 0.62, margin: '2px 0 14px' }}>
            {both ? '01 — AI Doradca' : 'AI Doradca'}
          </div>
          <Integrations projId={proj.id} channels={channels} refreshChannels={refreshChannels} />
        </>
      )}

      {isSales && (
        <>
          <div className="mono" style={{ opacity: 0.62, margin: isAdvisor ? '30px 0 14px' : '2px 0 14px' }}>
            {both ? '02 — AI Sprzedawca' : 'AI Sprzedawca'}
          </div>
          <SalesChannels projId={proj.id} cfgData={cfgData} refreshCfg={refreshCfg} />
        </>
      )}
    </>
  )
}

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

  if (!channels) return <SkelPage head={false} cards={3} />
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
        Podłącz aplikację Meta Business, wklej tokeny — doradca zacznie odpowiadać w tych kanałach.
        Token weryfikacji wpisujesz w Meta <b>raz dla całej aplikacji</b> (przy pierwszej subskrypcji webhooka),
        a tokeny stron podajesz osobno dla każdego kanału.
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
            'Meta → Twoja aplikacja → Przypadki użycia (Use cases) → „Messenger / Komunikacja z klientami" → Konfiguruj.',
            'W sekcji uprawnień dodaj: pages_messaging, pages_manage_metadata, pages_show_list.',
            'Webhooks: Callback URL = adres wyżej, Verify Token = token z tej karty (skopiuj przyciskiem). Subskrybuj pola messages i messaging_postbacks.',
            'Połącz stronę firmową i wygeneruj Page Access Token (przycisk „Generate token"). Wklej token i ID strony powyżej → Zapisz.',
            'Tryb deweloperski = bot odpowiada tylko administratorom i testerom aplikacji. Do klientów: opublikuj aplikację i przejdź App Review dla pages_messaging.',
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
            'Konto Instagram musi być profesjonalne i połączone ze stroną FB. W aplikacji Instagram: Ustawienia → Wiadomości → Połączone narzędzia (Connected tools) — włącz.',
            'Meta → Przypadki użycia → „Instagram messaging" (Messenger API for Instagram, czyli wariant ze stroną FB) → Konfiguruj.',
            'Uprawnienia: instagram_basic, instagram_manage_messages, pages_manage_metadata.',
            'Webhooks: obiekt „instagram", pole messages. Callback URL i Verify Token — te same co w Messengerze.',
            'Wklej ID konta Instagram, ID powiązanej strony i ten sam Page Access Token → Zapisz.',
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
            'Meta → Przypadki użycia → WhatsApp (Cloud API) → Konfiguruj.',
            'Phone Number ID skopiuj z zakładki API Setup.',
            'Stały token: Ustawienia firmy → Użytkownicy systemowi → wygeneruj token z uprawnieniem whatsapp_business_messaging.',
            'Webhooks: obiekt „whatsapp_business_account", pole messages; Callback URL i Verify Token jak wyżej.',
            'Pierwsza wiadomość poza oknem 24 h wymaga zatwierdzonego szablonu Meta.',
          ]}
        />
      </div>
    </>
  )
}

function CopyRow({ value, label = 'Kopiuj' }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <code className="mono" style={{ fontSize: 11.5, overflowWrap: 'anywhere', flex: 1 }}>{value || '—'}</code>
      <button
        className="btn sm"
        disabled={!value}
        onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500) }}
      >
        {ok ? <IcCheck /> : <IcCopy />} {ok ? 'Skopiowano' : label}
      </button>
    </div>
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

  // Token weryfikacji trzeba wkleić w Meta ZANIM cokolwiek zapiszemy (Meta od razu
  // uderza w webhooka), więc generujemy go przy otwarciu karty, a nie przy zapisie.
  useEffect(() => {
    if (open && !cfg.verify_token) {
      setCfg((c) => ({ ...c, verify_token: crypto.randomUUID().replaceAll('-', '').slice(0, 24) }))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <div className="note" style={{ marginBottom: 12 }}>
            <div className="mono" style={{ marginBottom: 4 }}>Callback URL (wklej w Meta)</div>
            <CopyRow value={`${FN_BASE}/brain-hook`} />
          </div>
          {fields.map(([k, label]) => (
            <label className="f" key={k}>
              <span className="mono">{label}</span>
              <input value={cfg[k] || ''} onChange={(e) => { dirty.current = true; setCfg((c) => ({ ...c, [k]: e.target.value })) }} />
            </label>
          ))}
          <label className="f">
            <span className="mono">Token weryfikacji webhooka (Verify Token)</span>
            <input
              value={cfg.verify_token || ''}
              onChange={(e) => { dirty.current = true; setCfg((c) => ({ ...c, verify_token: e.target.value })) }}
              placeholder="generowany automatycznie"
            />
          </label>
          <div style={{ marginBottom: 12 }}>
            <CopyRow value={cfg.verify_token || ''} label="Kopiuj token" />
          </div>
          <label className="f">
            <span className="mono">App Secret (opcjonalnie — włącza weryfikację podpisu Meta)</span>
            <input
              value={cfg.app_secret || ''}
              onChange={(e) => { dirty.current = true; setCfg((c) => ({ ...c, app_secret: e.target.value })) }}
              placeholder="Ustawienia aplikacji → Podstawowe → Klucz aplikacji"
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
