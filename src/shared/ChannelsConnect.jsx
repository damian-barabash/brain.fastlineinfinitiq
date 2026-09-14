// Kanały klienta podłączone przez Unipile (WhatsApp / Instagram / LinkedIn / Messenger /
// Telegram) — WSPÓLNE dla produktów, jak e-mail projektu. Ten sam komponent stoi
// w AI Doradcy, AI Sprzedawcy i AI Łowcy Leadów; każdy czyta `fiq_project_accounts`.
//
// Klient nie podaje nam haseł: admin generuje link `/connect?t=…`, klient loguje się
// na stronie Unipile (QR WhatsApp, hasło + 2FA), a konto samo przypisuje się do projektu
// (webhook). Stan konta pochodzi z webhooka statusu — „wylogowane" znaczy, że trzeba
// wysłać link do ponownego podłączenia.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, session } from './platform.js'
import { IcWhatsApp, IcInstagram, IcLinkedIn, IcFacebook, IcTelegram, IcCheck, IcCopy, IcRefresh, IcTrash, IcLink, IcShield } from './Icons.jsx'

export const PROVIDERS = [
  { key: 'WHATSAPP', label: 'WhatsApp', icon: IcWhatsApp, how: 'skan kodu QR w aplikacji WhatsApp (jak WhatsApp Web)' },
  { key: 'INSTAGRAM', label: 'Instagram', icon: IcInstagram, how: 'login i hasło Instagrama, kod 2FA jeśli włączony' },
  { key: 'LINKEDIN', label: 'LinkedIn', icon: IcLinkedIn, how: 'login i hasło LinkedIna, potwierdzenie w aplikacji' },
  { key: 'TELEGRAM', label: 'Telegram', icon: IcTelegram, how: 'numer telefonu i kod z Telegrama' },
  { key: 'MESSENGER', label: 'Messenger', icon: IcFacebook, how: 'login do Facebooka (konto prywatne; u dostawcy bez dalszego rozwoju)', warn: true },
]
export const providerMeta = (key) => PROVIDERS.find((p) => p.key === key) ?? { key, label: key, icon: IcLink, how: '' }

const STATUS = {
  OK: ['ok', 'działa'],
  CREDENTIALS: ['warn', 'wylogowane — podłącz ponownie'],
  PERMISSIONS: ['warn', 'brak uprawnień — podłącz ponownie'],
  STOPPED: ['warn', 'zatrzymane'],
  CONNECTING: ['', 'łączenie…'],
  ERROR: ['danger', 'błąd u dostawcy'],
  DELETED: ['danger', 'usunięte u dostawcy'],
}
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '')

export default function ChannelsConnect({
  projectId,
  providers = PROVIDERS.map((p) => p.key),
  title = 'Kanały klienta',
  intro,
  renderAccount, // (account) => JSX — miejsce na ustawienie produktu przy koncie (np. „doradca odpowiada")
  onChange, // po każdej zmianie listy kont (produkt może odświeżyć swoje dane)
}) {
  const isAdmin = session.user?.role === 'admin'
  const [link, setLink] = useState(null)
  const [chosen, setChosen] = useState(() => new Set(providers))
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [copied, setCopied] = useState(false)
  const accountsKey = useRef('')

  const load = useCallback(async () => {
    try {
      const d = await api('connect.get', { project_id: projectId })
      setLink(d)
      const key = JSON.stringify((d.accounts ?? []).map((a) => [a.account_id, a.status]))
      if (accountsKey.current && accountsKey.current !== key) onChange?.(d.accounts ?? [])
      accountsKey.current = key
      return d
    } catch (e) {
      setMsg({ ok: false, text: e.message })
      return null
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLink(null)
    accountsKey.current = ''
    load()
  }, [load])

  // link czeka na klienta — odświeżamy, żeby admin zobaczył podłączenie bez przeładowania
  useEffect(() => {
    if (link?.state !== 'waiting') return undefined
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [link?.state, load])

  async function makeLink(kind, accountId) {
    setBusy('link')
    setMsg(null)
    try {
      const d = await api('connect.create', {
        project_id: projectId,
        kind,
        account_id: accountId,
        providers: [...chosen],
        origin: window.location.origin,
      })
      await load()
      setCopied(false)
      try {
        await navigator.clipboard.writeText(d.url)
        setCopied(true)
        setMsg({ ok: true, text: kind === 'reconnect' ? 'Link do ponownego podłączenia skopiowany — wyślij go klientowi.' : 'Link gotowy i skopiowany — wyślij go klientowi.' })
      } catch {
        setMsg({ ok: true, text: 'Link gotowy — skopiuj go i wyślij klientowi.' })
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  async function revoke() {
    if (!window.confirm('Unieważnić link? Klient nie podłączy się nim.')) return
    setBusy('link')
    try {
      await api('connect.revoke', { project_id: projectId })
      await load()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  async function disconnect(acc) {
    if (!window.confirm(`Odłączyć ${acc.label} (${acc.account_name || acc.account_id})? Agent przestanie odpowiadać na tym kanale, a sesja u dostawcy zostanie skasowana.`)) return
    setBusy(acc.id)
    setMsg(null)
    try {
      await api('accounts.disconnect', { id: acc.id })
      const d = await load()
      onChange?.(d?.accounts ?? [])
      setMsg({ ok: true, text: `${acc.label} odłączony.` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMsg({ ok: false, text: 'Skopiuj adres ręcznie — przeglądarka nie dała dostępu do schowka.' })
    }
  }

  const accounts = link?.accounts ?? []
  const offered = PROVIDERS.filter((p) => providers.includes(p.key))
  const waiting = link?.state === 'waiting'

  return (
    <div className="card" data-channels-connect>
      <span className="corner tl" />
      <span className="corner br" />
      <div className="row" style={{ marginBottom: 8 }}>
        <IcLink style={{ width: 18, height: 18, color: 'var(--acid)' }} />
        <b>{title}</b>
        <button className="btn sm right" onClick={load} disabled={busy === 'link'} title="Odśwież stan kont">
          <IcRefresh /> Odśwież
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        {intro ??
          'Konta, na których agent rozmawia w imieniu klienta. Klient podłącza je sam jednym linkiem — bez aplikacji Meta, tokenów i weryfikacji firmy. Ustawione tutaj działa we wszystkich produktach tego projektu.'}
      </p>

      {link === null && <p className="muted">Sprawdzam konta…</p>}

      {link && accounts.length === 0 && (
        <div className="note" style={{ marginBottom: 12 }}>
          Żaden kanał nie jest jeszcze podłączony.
          {!isAdmin && ' Poproś opiekuna z Fastline InfinitiQ o link do podłączenia.'}
        </div>
      )}

      {accounts.map((a) => {
        const meta = providerMeta(a.provider)
        const Icon = meta.icon
        const [cls, label] = STATUS[a.status] ?? ['warn', a.status]
        return (
          <div className="int-row" key={a.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }} data-account={a.provider}>
            <Icon style={{ width: 18, height: 18, color: a.status === 'OK' ? 'var(--acid)' : 'var(--dim2)' }} />
            <div style={{ minWidth: 0 }}>
              <b>{meta.label}</b>
              {a.account_name ? <span className="muted"> · {a.account_name}</span> : null}
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>
                {a.status === 'OK' ? `podłączone ${fmt(a.connected_at)}` : `${label} · ${fmt(a.status_at)}`}
              </div>
              {renderAccount ? <div style={{ marginTop: 6 }}>{renderAccount(a)}</div> : null}
            </div>
            <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span className={'badge ' + cls}>{a.status === 'OK' ? 'działa' : label.split(' — ')[0]}</span>
              {isAdmin && a.status !== 'OK' && (
                <button className="btn sm" onClick={() => makeLink('reconnect', a.account_id)} disabled={busy === 'link'}>
                  <IcRefresh /> Link do ponownego podłączenia
                </button>
              )}
              {isAdmin && (
                <button className="btn sm danger" onClick={() => disconnect(a)} disabled={busy === a.id} title="Odłącz konto">
                  <IcTrash />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {isAdmin && (
        <>
          <div className="spacer" />
          <div className="row" style={{ marginBottom: 8 }}>
            <IcShield style={{ width: 16, height: 16, color: 'var(--acid)' }} />
            <b>Link do podłączenia dla klienta</b>
            {waiting && <span className="badge acid">czeka na klienta</span>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Klient otwiera link i loguje się na stronie dostawcy (Unipile) — hasła nie widzimy ani my, ani panel.
            Po zalogowaniu konto <b>samo</b> przypisuje się do projektu. Jeden link może podłączyć kilka kanałów po kolei.
          </p>

          {waiting ? (
            <>
              <div className="codebox" style={{ marginBottom: 10 }}>
                <button className="btn sm copy" onClick={copyLink}>
                  <IcCopy /> {copied ? 'Skopiowano' : 'Kopiuj'}
                </button>
                <code>{link.url}</code>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <a className="btn sm" href={link.url} target="_blank" rel="noreferrer">Otwórz</a>
                <button className="btn sm danger" onClick={revoke} disabled={busy === 'link'}>
                  <IcTrash /> Unieważnij
                </button>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>
                  {link.kind === 'reconnect' ? 'ponowne podłączenie' : (link.providers ?? []).map((p) => providerMeta(p).label).join(' · ')}
                  {' · '}otwarć: {link.opens ?? 0}
                  {link.expires_at ? ` · ważny do ${new Date(link.expires_at).toLocaleDateString('pl-PL')}` : ''}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="chips" style={{ marginBottom: 10 }} data-provider-chips>
                {offered.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    className={chosen.has(p.key) ? 'on' : ''}
                    title={p.how}
                    onClick={() => {
                      const next = new Set(chosen)
                      if (next.has(p.key)) next.delete(p.key)
                      else next.add(p.key)
                      setChosen(next)
                    }}
                  >
                    {p.label}
                    {p.warn ? ' ⚠' : ''}
                  </button>
                ))}
              </div>
              <button className="btn primary" onClick={() => makeLink('create')} disabled={busy === 'link' || chosen.size === 0}>
                <IcLink style={{ width: 15, height: 15 }} /> {busy === 'link' ? 'Generuję…' : 'Wygeneruj link dla klienta'}
              </button>
            </>
          )}
          {msg && (
            <p className={msg.ok ? 'muted' : 'err'} style={{ marginTop: 10 }}>
              {msg.ok ? <IcCheck style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> : null} {msg.text}
            </p>
          )}
        </>
      )}
      {!isAdmin && msg && !msg.ok && <p className="err" style={{ marginTop: 10 }}>{msg.text}</p>}
    </div>
  )
}
