// Integracje doradcy: gdzie AI odbiera wiadomości — widget na stronie,
// WhatsApp, Instagram, Messenger. Osobna sekcja w menu (tak samo jak w
// LeadEngine), żeby podłączanie kanałów nie chowało się w zakładce archetypu.
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

export default function IntegrationsPage() {
  const proj = session.proj
  const [chData, refreshChannels] = useCached('channels.list', { project_id: proj.id })
  const channels = chData?.channels ?? null
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {proj.name} // kanały
          </div>
          <h1>Integracje</h1>
          <p className="sub">Kanały, w których pracuje AI Doradca.</p>
        </div>
      </div>
      <Integrations projId={proj.id} channels={channels} refreshChannels={refreshChannels} />
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
