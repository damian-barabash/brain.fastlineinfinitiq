// ── Klucze platformy w jednym miejscu ───────────────────────────────────────
// Model (DeepSeek/Barabash), Unipile i Google Places. Wszystkie trzy działają
// tak samo: wklejasz klucz, zapisujesz — i od razu sprawdzamy u dostawcy, czy
// naprawdę działa. Sam fakt zapisania klucza nic nie znaczy: klucz Google bywa
// poprawny, a Places API wyłączone; token Unipile ważny, a bez podłączonych kont.
// Zapisany klucz wraca zamaskowany — puste pole znaczy „nie zmieniam".
import { useEffect, useState } from 'react'
import { api } from './platform.js'
import { IcSpark, IcLinkedIn, IcMap, IcCheck, IcRefresh } from './Icons.jsx'
import { SkelCard } from './Skeleton.jsx'

const CARDS = [
  {
    key: 'ai_provider',
    icon: IcSpark,
    title: 'Model AI (DeepSeek, Barabash, dowolny OpenAI-compatible)',
    where: null,
    desc:
      'Z tego modelu korzysta wszystko: doradca, sprzedawca i Lead Engine. Zmiana działa od następnej wiadomości, bez wgrywania czegokolwiek.',
  },
  {
    key: 'unipile',
    icon: IcLinkedIn,
    title: 'Unipile — LinkedIn',
    where: 'https://dashboard.unipile.com',
    desc:
      'Jeden token na całą platformę. Konta LinkedIn podpinasz po stronie Unipile, a z którego konta szuka dany projekt — wybierasz w Lead Engine → Integracje.',
  },
  {
    key: 'maps',
    icon: IcMap,
    title: 'Google Places — firmy z mapy',
    where: 'https://console.cloud.google.com/apis/library/places.googleapis.com',
    desc:
      'Źródło leadów lokalnych: nazwa, adres, telefon, strona. W projekcie Google musi być włączone Places API (New).',
  },
]

export default function IntegrationsAdmin() {
  const [cfg, setCfg] = useState(null)
  const [st, setSt] = useState({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  // Zapisany klucz wraca z serwera zamaskowany (••••1234). W polu zostawiamy
  // pustkę — kropki wyglądałyby jak wpisana wartość, a użytkownik nie wiedziałby,
  // czy coś tam jest, czy nie. Fakt posiadania klucza mówi placeholder.
  const strip = (v) => {
    const o = { ...(v ?? {}) }
    if (typeof o.api_key === 'string' && o.api_key.startsWith('••••')) {
      o.api_key_saved = o.api_key.slice(-4)
      o.api_key = ''
    }
    return o
  }

  useEffect(() => {
    api('settings.get').then((d) => {
      setCfg({
        ai_provider: strip(d.settings.ai_provider ?? { key_secret: 'BRAIN_AI_KEY' }),
        unipile: strip(d.settings.unipile ?? { dsn: '', key_secret: 'UNIPILE_TOKEN' }),
        maps: strip(d.settings.maps ?? { key_secret: 'GOOGLE_MAPS_KEY' }),
      })
    })
    check(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function check(force) {
    setBusy(force ? 'check' : 'boot')
    try {
      const d = await api('integrations.status', { force })
      setSt(d.integrations ?? {})
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  // Zapis i sprawdzenie to jedna operacja — inaczej łatwo zapisać zły klucz
  // i dowiedzieć się o tym dopiero przy pierwszym wyszukiwaniu.
  async function save(key) {
    setBusy(key)
    setMsg(null)
    try {
      await api('settings.set', { key, value: cfg[key] })
      const d = await api('integrations.status', { force: true })
      setSt(d.integrations ?? {})
      const ok = d.integrations?.[key]?.ok
      setMsg({ ok, text: ok ? 'Zapisane i sprawdzone — działa.' : 'Zapisane, ale dostawca zgłasza problem (poniżej).' })
      // klucz zniknął z pola: od tej pory wraca zamaskowany
      setCfg((c) => ({ ...c, [key]: { ...c[key], api_key: '' } }))
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  if (!cfg) {
    return (
      <div className="grid g2">
        <SkelCard lines={6} />
        <SkelCard lines={4} />
        <SkelCard lines={3} />
      </div>
    )
  }
  const set = (key, field) => (e) => setCfg((c) => ({ ...c, [key]: { ...c[key], [field]: e.target.value } }))
  const num = (key, field) => (e) => setCfg((c) => ({ ...c, [key]: { ...c[key], [field]: Number(e.target.value) } }))

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <p className="muted" style={{ flex: 1, minWidth: 220 }}>
          Klucze są wspólne dla całej platformy i dla każdego produktu — ustawiasz je raz, z dowolnej domeny.
        </p>
        <button className="btn sm" onClick={() => check(true)} disabled={busy === 'check'}>
          <IcRefresh /> {busy === 'check' ? 'Sprawdzam…' : 'Sprawdź wszystko'}
        </button>
      </div>

      <div className="grid g2">
        {CARDS.map((c) => {
          const s = st[c.key] ?? {}
          const known = Object.keys(st).length > 0
          return (
            <div className="card" key={c.key}>
              <div className="row" style={{ marginBottom: 8, gap: 10, alignItems: 'flex-start' }}>
                <c.icon style={{ color: s.ok ? 'var(--acid)' : 'var(--dim2)', flexShrink: 0, marginTop: 2 }} />
                <b style={{ flex: 1, minWidth: 0 }}>{c.title}</b>
                {known ? (
                  <span className={'badge ' + (s.ok ? 'ok' : 'warn')}>{s.ok ? 'działa' : 'nie działa'}</span>
                ) : (
                  <span className="badge">sprawdzam…</span>
                )}
              </div>
              <p className="muted" style={{ marginBottom: 10 }}>{c.desc}</p>

              {known && !s.ok && s.reason && (
                <div className="note warn" style={{ marginBottom: 12 }}>
                  {s.reason}{' '}
                  {(s.url || c.where) && (
                    <a className="link-dim" href={s.url || c.where} target="_blank" rel="noreferrer">
                      włącz tutaj ↗
                    </a>
                  )}
                </div>
              )}
              {known && s.ok && s.detail && (
                <div className="note" style={{ marginBottom: 12 }}>{s.detail}</div>
              )}

              {c.key === 'ai_provider' && (
                <>
                  <label className="f">
                    <span className="mono">Base URL</span>
                    <input value={cfg.ai_provider.base_url || ''} onChange={set('ai_provider', 'base_url')} placeholder="https://api.deepseek.com" />
                  </label>
                  <label className="f">
                    <span className="mono">Model</span>
                    <input value={cfg.ai_provider.model || ''} onChange={set('ai_provider', 'model')} placeholder="deepseek-chat" />
                  </label>
                  <label className="f">
                    <span className="mono">Klucz API</span>
                    <input
                      type="password"
                      value={cfg.ai_provider.api_key || ''}
                      onChange={set('ai_provider', 'api_key')}
                      placeholder={
                        cfg.ai_provider.api_key_saved
                          ? `zapisany ••••${cfg.ai_provider.api_key_saved} — puste = bez zmian`
                          : 'wklej klucz'
                      }
                    />
                  </label>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <label className="f">
                      <span className="mono">Temperature</span>
                      <input type="number" step="0.1" min="0" max="2" value={cfg.ai_provider.temperature ?? 0.6} onChange={num('ai_provider', 'temperature')} />
                    </label>
                    <label className="f">
                      <span className="mono">Max tokens</span>
                      <input type="number" min="100" max="4000" value={cfg.ai_provider.max_tokens ?? 700} onChange={num('ai_provider', 'max_tokens')} />
                    </label>
                  </div>
                  <label className="f">
                    <span className="mono">Nazwa sekretu Supabase (używana, gdy pole klucza jest puste)</span>
                    <input value={cfg.ai_provider.key_secret || ''} onChange={set('ai_provider', 'key_secret')} placeholder="BRAIN_AI_KEY" />
                  </label>
                </>
              )}

              {c.key === 'unipile' && (
                <>
                  <label className="f">
                    <span className="mono">DSN instancji</span>
                    <input value={cfg.unipile.dsn || ''} onChange={set('unipile', 'dsn')} placeholder="api8.unipile.com:13843" />
                  </label>
                  <label className="f">
                    <span className="mono">Token API</span>
                    <input
                      type="password"
                      value={cfg.unipile.api_key || ''}
                      onChange={set('unipile', 'api_key')}
                      placeholder={
                        cfg.unipile.api_key_saved
                          ? `zapisany ••••${cfg.unipile.api_key_saved} — puste = bez zmian`
                          : 'wklej token'
                      }
                    />
                  </label>
                </>
              )}

              {c.key === 'maps' && (
                <label className="f">
                  <span className="mono">Klucz API</span>
                  <input
                    type="password"
                    value={cfg.maps.api_key || ''}
                    onChange={set('maps', 'api_key')}
                    placeholder={
                      cfg.maps.api_key_saved
                        ? `zapisany ••••${cfg.maps.api_key_saved} — puste = bez zmian`
                        : 'wklej klucz'
                    }
                  />
                </label>
              )}

              <div className="row" style={{ gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <button className="btn primary" onClick={() => save(c.key)} disabled={busy === c.key}>
                  <IcCheck /> {busy === c.key ? 'Zapisuję i sprawdzam…' : 'Zapisz i sprawdź'}
                </button>
                {c.where && (
                  <a className="link-dim mono" style={{ fontSize: 11 }} href={c.where} target="_blank" rel="noreferrer">
                    gdzie to skonfigurować ↗
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {msg && (
        <p className={msg.ok ? 'muted' : 'err'} style={{ marginTop: 12 }}>
          {msg.text}
        </p>
      )}
    </>
  )
}
