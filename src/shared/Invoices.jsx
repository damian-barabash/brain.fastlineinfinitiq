// Faktury (2026-10-28) — jeden komponent dla „Płatności" i „Ustawień" w każdym produkcie.
// Klient widzi faktury swojej firmy; administrator — wszystkie faktury platformy
// (szukaj po firmie / NIP / numerze, sumy, stan wysyłki do ING Księgowość, ponów).
// Numer = numer z ING Księgowość, gdy faktura już tam wyszła; inaczej nasz wewnętrzny.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { postEdge, session } from './platform.js'

async function billing(action, payload = {}) {
  const r = await postEdge('billing', { action, token: session.token, ...payload }, { read: !/retry/.test(action) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

const zl = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł'
const day = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pl-PL') : '—')
const ING = {
  ok: ['ok', 'w ING Księgowość'],
  pending: ['warn', 'wysyłam do ING'],
  error: ['danger', 'błąd ING'],
  off: ['', 'ING niepodłączone'],
  unpaid: ['', '—'],
}

export default function Invoices({ invoices: given, title = 'Faktury' }) {
  const admin = session.user?.role === 'admin'
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [st, setSt] = useState('all')
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    if (given) return setD({ invoices: given })
    return billing(admin ? 'admin.invoices' : 'account.get').then(setD).catch((e) => setErr(e.message))
  }, [admin, given])
  useEffect(() => { load() }, [load])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (d?.invoices ?? []).filter((i) =>
      (st === 'all' || i.status === st) &&
      (!t || [i.number, i.internal, i.company, i.nip, i.workspace].some((v) => String(v ?? '').toLowerCase().includes(t))))
  }, [d, q, st])

  async function retry(id) {
    setBusy(id)
    try { await billing('admin.invoice.retry', { id }); await load() } catch { /* stan pokaże tabela */ }
    setBusy('')
  }

  if (err) return <div className="empty">Nie udało się wczytać faktur.</div>
  if (!d) return <div className="skel skel-card" style={{ height: 160 }} />

  return (
    <>
      <div className="sec-h">{admin && !given ? 'Wszystkie faktury platformy' : title}</div>
      {admin && !given && (
        <div className="inv-tools">
          <input className="inv-search" placeholder="Szukaj: firma, NIP, numer" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">
            {[['all', 'Wszystkie'], ['paid', 'Opłacone'], ['unpaid', 'Do zapłaty']].map(([k, l]) => (
              <button key={k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{l}</button>
            ))}
          </div>
          <span className="inv-sum">Wpłynęło <b>{zl(d.sum_paid)}</b> · do zapłaty <b>{zl(d.sum_due)}</b></span>
          {!d.ing_connected && <span className="badge warn">ING Księgowość niepodłączone — faktury wewnętrzne</span>}
        </div>
      )}
      {list.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Numer</th>
                {admin && !given && <th>Firma</th>}
                <th>Data</th>
                <th style={{ textAlign: 'right' }}>Brutto</th>
                <th>Status</th>
                {admin && !given && <th>ING</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const [tone, lbl] = ING[i.ing] ?? ['', '']
                return (
                  <tr key={i.id}>
                    <td className="ell"><b>{i.number}</b></td>
                    {admin && !given && (
                      <td className="ell" title={i.nip ? `NIP ${i.nip}` : ''}>{i.company || i.workspace || '—'}</td>
                    )}
                    <td>{day(i.issue_date)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{zl(i.gross)}</td>
                    <td><span className={`badge ${i.status === 'paid' ? 'ok' : 'warn'}`}>{i.status === 'paid' ? 'Opłacona' : 'Do zapłaty'}</span></td>
                    {admin && !given && (
                      <td>
                        <span className={`badge ${tone}`} title={i.ing_error || ''}>{lbl}</span>
                        {i.ing === 'error' && (
                          <button className="btn sm" style={{ marginLeft: 6 }} disabled={busy === i.id} onClick={() => retry(i.id)}>
                            {busy === i.id ? '…' : 'Ponów'}
                          </button>
                        )}
                      </td>
                    )}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {i.pay_url && <a className="btn primary" href={i.pay_url} style={{ marginRight: 6 }}>Zapłać</a>}
                      <a className="btn" href={i.url} target="_blank" rel="noopener">{i.ing === true || i.ing === 'ok' ? 'PDF' : 'Pobierz'}</a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">{q || st !== 'all' ? 'Brak faktur dla tego filtra.' : 'Brak faktur.'}</div>
      )}
    </>
  )
}
