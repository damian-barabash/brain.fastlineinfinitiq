// Messenger strony firmowej + Instagram Business — przez OAuth NASZEJ aplikacji Meta „Infinitiq".
// Unipile nie umie stron Facebooka (tylko skrzynka prywatna), więc tu klient klika
// „Połącz przez Facebooka", wybiera stronę w oknie Meta i wraca na /meta/callback —
// tokeny stron i subskrypcja webhooka idą kodem, klient nic nie wkleja.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { IcFacebook, IcInstagram, IcTrash, IcRefresh, IcCheck } from './Icons.jsx'

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '')

export default function MetaConnect({ projectId, onChange }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)

  async function load() {
    try {
      setSt(await api('meta.status', { project_id: projectId }))
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }
  useEffect(() => {
    setSt(null)
    load()
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setBusy('start')
    setMsg(null)
    try {
      const d = await api('meta.oauth.url', { project_id: projectId, origin: window.location.origin })
      window.location.href = d.url
    } catch (e) {
      setMsg({ ok: false, text: e.message })
      setBusy('')
    }
  }

  async function disconnect(p) {
    if (!window.confirm(`Odłączyć ${p.type === 'instagram' ? 'Instagram' : 'Messenger'} „${p.name}"? Doradca przestanie odpowiadać na tym kanale.`)) return
    setBusy(p.id)
    try {
      const d = await api('meta.disconnect', { id: p.id })
      setSt((s) => ({ ...(s ?? {}), pages: d.pages ?? [] }))
      onChange?.()
      setMsg({ ok: true, text: 'Odłączone.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  const pages = st?.pages ?? []
  return (
    <div className="card" data-meta-connect>
      <span className="corner tl" />
      <span className="corner br" />
      <div className="row" style={{ marginBottom: 8 }}>
        <IcFacebook style={{ width: 18, height: 18, color: 'var(--acid)' }} />
        <b>Messenger strony firmowej — przez Facebooka</b>
        <button className="btn sm right" onClick={load} disabled={!!busy} title="Odśwież">
          <IcRefresh /> Odśwież
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        Jedno kliknięcie: okno Facebooka, wybór strony, „Zezwól". Tokeny i webhook ustawiamy sami — nic nie wklejasz.
        Instagram podłącza się osobno, linkiem w karcie „Kanały klienta" wyżej.
      </p>

      {st === null && <p className="muted">Sprawdzam…</p>}
      {st && !st.configured && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          Aplikacja Meta nie jest jeszcze skonfigurowana po stronie platformy (sekrety META_APP_ID / META_APP_SECRET).
        </div>
      )}

      {st && pages.length === 0 && (
        <div className="note" style={{ marginBottom: 12 }}>Żadna strona nie jest jeszcze podłączona.</div>
      )}
      {pages.map((p) => {
        const Icon = p.type === 'instagram' ? IcInstagram : IcFacebook
        return (
          <div className="int-row" key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center' }} data-meta-page={p.type}>
            <Icon style={{ width: 18, height: 18, color: 'var(--acid)' }} />
            <div style={{ minWidth: 0 }}>
              <b>{p.type === 'instagram' ? `Instagram · @${p.ig_username || p.ig_id}` : `Messenger · ${p.name.replace(/^Messenger · /, '')}`}</b>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--dim2)' }}>
                {p.type === 'instagram' ? `konto ${p.ig_id}` : `strona ${p.page_id}`} · podłączone {fmt(p.connected_at)}
              </div>
            </div>
            <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <span className={'badge ' + (p.enabled ? 'ok' : 'warn')}>{p.enabled ? 'działa' : 'wyłączony'}</span>
              <button className="btn sm danger" onClick={() => disconnect(p)} disabled={busy === p.id} title="Odłącz">
                <IcTrash />
              </button>
            </div>
          </div>
        )
      })}

      <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={start} disabled={busy === 'start' || (st && !st.configured)} data-meta-start>
          <IcFacebook style={{ width: 15, height: 15 }} /> {busy === 'start' ? 'Otwieram Facebooka…' : pages.length ? 'Podłącz kolejną stronę' : 'Połącz przez Facebooka'}
        </button>
        {msg && (
          <span className={msg.ok ? 'muted' : 'err'}>
            {msg.ok ? <IcCheck style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> : null} {msg.text}
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Do czasu zatwierdzenia aplikacji przez Meta (App Review) podłączyć stronę mogą tylko osoby dodane do aplikacji
        jako testerzy lub administratorzy. Potem — każdy klient sam.
      </p>
    </div>
  )
}
