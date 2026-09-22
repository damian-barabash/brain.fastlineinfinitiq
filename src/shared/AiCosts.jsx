// Admin → Koszty AI: ile tokenów i pieniędzy poszło na który projekt.
// Liczone DOKŁADNIE tak, jak rozlicza DeepSeek: wejście bez cache, wejście z cache, wyjście,
// stawka szczytowa albo poza szczytem po czasie żądania (UTC). Suma za okres dla modeli
// deepseek-* ma się zgadzać z kwotą w panelu DeepSeeka dla tego klucza — do centa.
import { useEffect, useMemo, useState } from 'react'
import { api } from './platform.js'
import { useCached } from './useCached.js'
import { IcWallet, IcRefresh, IcSpark, IcFolder } from './Icons.jsx'
import { SkelStats, SkelList } from './Skeleton.jsx'
import { StatCard, Bars } from './Charts.jsx'

const PERIODS = [
  ['today', 'Dziś'],
  [7, '7 dni'],
  [30, '30 dni'],
  [90, '90 dni'],
]
const PRODUCT = { advisor: 'AI Doradca', sales: 'AI Sprzedawca', hand: 'AI Łowca Leadów', brain: 'Baza wiedzy (sync)' }
const usd = (n) => `${Number(n || 0).toFixed(n >= 1 ? 2 : 4)} $`
const tok = (n) => Number(n || 0).toLocaleString('pl-PL')

export default function AiCosts() {
  const [days, setDays] = useState(30)
  const [report, refresh] = useCached('usage.report', { days })
  const [balance, setBalance] = useState(null)
  const [balErr, setBalErr] = useState('')

  useEffect(() => {
    api('usage.balance')
      .then((b) => (b.ok ? setBalance(b) : setBalErr(b.reason || 'brak')))
      .catch((e) => setBalErr(e.message))
  }, [])

  // projekt → wiersze produktów (rozwijane), posortowane po koszcie
  const byProject = useMemo(() => {
    if (!report) return []
    const map = new Map()
    for (const r of report.rows) {
      const k = r.project_id ?? 'none'
      const p = map.get(k) ?? { key: k, project: r.project, workspace: r.workspace, calls: 0, prompt: 0, hit: 0, miss: 0, completion: 0, cost: 0, items: [] }
      p.calls += r.calls
      p.prompt += r.prompt
      p.hit += r.hit
      p.miss += r.miss
      p.completion += r.completion
      p.cost += r.cost
      p.items.push(r)
      map.set(k, p)
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost)
  }, [report])

  const totals = useMemo(() => {
    if (!report) return null
    const t = { calls: 0, prompt: 0, hit: 0, miss: 0, completion: 0 }
    for (const r of report.rows) {
      t.calls += r.calls
      t.prompt += r.prompt
      t.hit += r.hit
      t.miss += r.miss
      t.completion += r.completion
    }
    return t
  }, [report])

  const [open, setOpen] = useState(null)

  return (
    <>
      <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="chips">
          {PERIODS.map(([k, l]) => (
            <button key={k} className={days === k ? 'on' : ''} onClick={() => setDays(k)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn sm right" onClick={() => refresh()}>
          <IcRefresh /> Odśwież
        </button>
      </div>

      {!report || !totals ? (
        <SkelStats n={4} />
      ) : (
        <div className="grid g4">
          <StatCard icon={<IcWallet />} label="Wydatki w okresie" value={usd(report.total)} tone="var(--warn)" />
          <StatCard
            icon={<IcWallet />}
            label="Saldo DeepSeek"
            value={balance ? `${balance.total.toFixed(2)} ${balance.currency}` : balErr ? '—' : '…'}
            tone={balance && balance.total < 5 ? 'var(--danger)' : 'var(--ok)'}
          />
          <StatCard icon={<IcSpark />} label="Tokeny wejścia" value={tok(totals.prompt)} suffix={totals.prompt ? `(${Math.round((totals.hit / totals.prompt) * 100)}% z cache)` : ''} />
          <StatCard icon={<IcSpark />} label="Tokeny wyjścia" value={tok(totals.completion)} />
        </div>
      )}
      {balErr && <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>Saldo DeepSeek: {balErr}</p>}

      <div className="spacer" />
      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <IcFolder style={{ width: 18, height: 18, color: 'var(--acid)' }} />
          <b>Koszt per projekt</b>
          {report && <span className="badge right">{report.rows.length ? `${byProject.length} projektów` : 'brak wywołań'}</span>}
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Każde wywołanie modelu zapisuje tokeny wejścia (osobno z cache i bez), wyjścia i stawkę z chwili żądania
          (szczyt / poza szczytem, UTC) — dokładnie jak rozlicza DeepSeek. Suma za okres dla modeli DeepSeek to ta sama
          kwota, którą widzisz w ich panelu dla tego klucza.
        </p>
        {!report && <SkelList rows={4} />}
        {report && !byProject.length && <p className="muted">W tym okresie model nie był wołany.</p>}
        {report && !!byProject.length && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Wywołania</th>
                <th>Wejście (bez cache)</th>
                <th>Wejście (cache)</th>
                <th>Wyjście</th>
                <th style={{ textAlign: 'right' }}>Koszt</th>
              </tr>
            </thead>
            <tbody>
              {byProject.map((p) => (
                <ProjectRows key={p.key} p={p} open={open === p.key} onToggle={() => setOpen(open === p.key ? null : p.key)} />
              ))}
              <tr>
                <td>
                  <b>Razem</b>
                </td>
                <td className="mono">{tok(totals.calls)}</td>
                <td className="mono">{tok(totals.miss)}</td>
                <td className="mono">{tok(totals.hit)}</td>
                <td className="mono">{tok(totals.completion)}</td>
                <td className="mono" style={{ textAlign: 'right', color: 'var(--acid)' }}>
                  <b>{usd(report.total)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {report && report.deepseek !== report.total && (
          <p className="chart-tip" style={{ marginTop: 10 }}>
            W tym: DeepSeek {usd(report.deepseek)} (reszta to model lokalny — koszt 0).
          </p>
        )}
      </div>

      {report && !!report.daily?.length && (
        <>
          <div className="spacer" />
          <div className="card chart-card">
            <h3>Wydatki dziennie</h3>
            <Bars items={report.daily.slice(-14).map((d) => ({ label: `${d.d.slice(8, 10)}.${d.d.slice(5, 7)}`, value: +d.cost.toFixed(4) }))} />
          </div>
        </>
      )}
    </>
  )
}

function ProjectRows({ p, open, onToggle }) {
  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={onToggle}>
        <td>
          <b>{p.project}</b>
          {p.workspace && <span className="muted" style={{ fontSize: 12 }}> · {p.workspace}</span>}
          <span className="mono" style={{ marginLeft: 8, fontSize: 10, color: 'var(--dim2)' }}>{open ? 'zwiń' : 'produkty ▸'}</span>
        </td>
        <td className="mono">{tok(p.calls)}</td>
        <td className="mono">{tok(p.miss)}</td>
        <td className="mono">{tok(p.hit)}</td>
        <td className="mono">{tok(p.completion)}</td>
        <td className="mono" style={{ textAlign: 'right' }}>
          <b>{usd(p.cost)}</b>
        </td>
      </tr>
      {open &&
        p.items.map((r) => (
          <tr key={`${r.product_key}|${r.model}`} style={{ background: 'var(--acid-soft)' }}>
            <td style={{ paddingLeft: 26 }}>
              {PRODUCT[r.product_key] || r.product_key} <span className="mono" style={{ fontSize: 10, color: 'var(--dim2)' }}>{r.model}</span>
            </td>
            <td className="mono">{tok(r.calls)}</td>
            <td className="mono">{tok(r.miss)}</td>
            <td className="mono">{tok(r.hit)}</td>
            <td className="mono">{tok(r.completion)}</td>
            <td className="mono" style={{ textAlign: 'right' }}>{usd(r.cost)}</td>
          </tr>
        ))}
    </>
  )
}
