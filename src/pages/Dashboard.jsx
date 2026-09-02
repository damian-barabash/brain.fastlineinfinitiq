// Dashboard: Przegląd / Konwersacje / Porównanie kosztów.
import { useMemo, useState } from 'react'
import { api, session } from '../lib/api.js'
import { useCached } from '../lib/useCached.js'
import { LineChart, Bars, Donut, StatCard } from '../components/Charts.jsx'
import {
  IcClock,
  IcChat,
  IcText,
  IcCheck,
  IcHandoff,
  IcUser,
  IcSpark,
  IcPulse,
  IcWallet,
  IcEye,
  IcX,
  IcSend,
  IcMsg,
} from '../components/Icons.jsx'
import { SkelStats, SkelChart, SkelText } from '../shared/Skeleton.jsx'

const SAVED_MIN_PER_REPLY = 2 // minuty pracy człowieka na jedną odpowiedź
const CHANNELS = [
  { key: '', label: 'Wszystkie' },
  { key: 'widget', label: 'Widget' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
]

function dayKey(iso) {
  return iso.slice(0, 10)
}
function fmtDay(k) {
  const [, m, d] = k.split('-')
  return `${d}.${m}`
}

export default function Dashboard() {
  const proj = session.proj
  const [days, setDays] = useState(30)
  const [channel, setChannel] = useState('')
  const [tab, setTab] = useState('overview')
  const [wage, setWage] = useState(45) // zł/h — do porównania kosztów
  const [data, refresh] = useCached('stats', { project_id: proj.id, days, channel_type: channel || undefined })

  const S = useMemo(() => {
    if (!data) return null
    // najnowsze rozmowy na górze
    const convs = [...data.conversations].sort((a, b) => new Date(b.last_at || b.started_at) - new Date(a.last_at || a.started_at))
    const msgs = data.messages
    const aiMsgs = msgs.filter((m) => m.role === 'assistant')
    const userMsgs = msgs.filter((m) => m.role === 'user')
    const chars = aiMsgs.reduce((s, m) => s + (m.chars || 0), 0)
    const savedMin = aiMsgs.length * SAVED_MIN_PER_REPLY
    const lat = aiMsgs.filter((m) => m.latency_ms)
    const avgLatency = lat.length ? Math.round(lat.reduce((s, m) => s + m.latency_ms, 0) / lat.length / 100) / 10 : 0

    // serie dzienne
    const daysArr = []
    for (let i = days - 1; i >= 0; i--) {
      daysArr.push(dayKey(new Date(Date.now() - i * 864e5).toISOString()))
    }
    const perDay = (rows, dateField, val = () => 1) => {
      const map = Object.fromEntries(daysArr.map((d) => [d, 0]))
      for (const r of rows) {
        const k = dayKey(r[dateField])
        if (k in map) map[k] += val(r)
      }
      return daysArr.map((d) => map[d])
    }
    const savedSeries = perDay(aiMsgs, 'created_at', () => SAVED_MIN_PER_REPLY)
    const charsSeries = perDay(aiMsgs, 'created_at', (m) => m.chars || 0)
    const convSeries = perDay(convs, 'started_at')

    const byStatus = { open: 0, closed: 0, redirected: 0 }
    for (const c of convs) byStatus[c.status] = (byStatus[c.status] || 0) + 1
    const byChannel = {}
    for (const c of convs) byChannel[c.channel_type] = (byChannel[c.channel_type] || 0) + 1

    // godziny szczytu
    const byHour = Array(24).fill(0)
    for (const m of userMsgs) byHour[new Date(m.created_at).getHours()]++
    const peakHour = byHour.indexOf(Math.max(...byHour))

    const humanCost = Math.round((savedMin / 60) * wage)
    return {
      convs,
      total: convs.length,
      byStatus,
      byChannel,
      userMsgs: userMsgs.length,
      aiMsgs: aiMsgs.length,
      chars,
      savedMin,
      avgLatency,
      savedSeries,
      charsSeries,
      convSeries,
      labels: daysArr.map(fmtDay),
      byHour,
      peakHour,
      humanCost,
    }
  }, [data, days, wage])

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="mono">
            <span className="dot" style={{ marginRight: 8 }} />
            {proj.name} // analityka
          </div>
          <h1>Dashboard</h1>
        </div>
        <div className="row">
          <div className="chips">
            {CHANNELS.map((c) => (
              <button key={c.key} className={channel === c.key ? 'on' : ''} onClick={() => setChannel(c.key)}>
                {c.label}
              </button>
            ))}
          </div>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={7}>Ostatnie 7 dni</option>
            <option value={30}>Ostatnie 30 dni</option>
            <option value={90}>Ostatnie 90 dni</option>
          </select>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
          Przegląd
        </button>
        <button className={tab === 'convs' ? 'on' : ''} onClick={() => setTab('convs')}>
          Konwersacje
        </button>
        <button className={tab === 'costs' ? 'on' : ''} onClick={() => setTab('costs')}>
          Porównanie
        </button>
        <button className={tab === 'sales' ? 'on' : ''} onClick={() => setTab('sales')}>
          Sprzedawca
        </button>
      </div>

      {tab === 'sales' && <SalesStats projId={proj.id} days={days} />}
      {tab !== 'sales' && !S && (
        <>
          <SkelStats n={8} />
          <div className="spacer" />
          <div className="grid gch">
            <SkelChart />
            <SkelChart />
          </div>
        </>
      )}
      {S && tab === 'overview' && <Overview S={S} />}
      {S && tab === 'convs' && <Conversations S={S} projId={proj.id} refetch={refresh} />}
      {S && tab === 'costs' && <Costs S={S} wage={wage} setWage={setWage} />}
    </>
  )
}

function Overview({ S }) {
  return (
    <>
      <div className="hero-band">
        <div className="hb-ic">
          <IcClock />
        </div>
        <div>
          <div className="hb-label">Twój zespół zaoszczędził</div>
          <div className="hb-val">
            ~{S.savedMin} <small>minut</small>
          </div>
          <div className="hb-sub">dzięki Brain AI • Tak trzymać!</div>
        </div>
        <div className="right" style={{ textAlign: 'right' }}>
          <div className="hb-label">Śr. czas odpowiedzi AI</div>
          <div className="hb-val" style={{ fontSize: 28 }}>
            {S.avgLatency || '—'}
            <small> s</small>
          </div>
        </div>
      </div>
      <div className="spacer" />
      <div className="grid g4">
        <StatCard icon={<IcChat />} label="Łączna liczba konwersacji" value={S.total} />
        <StatCard icon={<IcCheck />} label="Zakończone konwersacje" value={S.byStatus.closed || 0} tone="var(--ok)" />
        <StatCard icon={<IcHandoff />} label="Przekazane do sprzedaży" value={S.byStatus.redirected || 0} tone="var(--warn)" />
        <StatCard icon={<IcPulse />} label="Otwarte konwersacje" value={S.byStatus.open || 0} />
        <StatCard icon={<IcUser />} label="Wiadomości użytkowników" value={S.userMsgs} />
        <StatCard icon={<IcSpark />} label="Wiadomości Brain AI" value={S.aiMsgs} />
        <StatCard icon={<IcText />} label="Zużyte znaki" value={S.chars.toLocaleString('pl-PL')} />
        <StatCard icon={<IcEye />} label="Godzina szczytu" value={S.userMsgs ? `${S.peakHour}:00` : '—'} />
      </div>
      <div className="spacer" />
      <div className="grid gch">
        <div className="card chart-card">
          <h3>Zaoszczędzony czas</h3>
          <LineChart series={S.savedSeries} labels={S.labels} unit="min" />
          <p className="chart-tip">Założenie: jedna odpowiedź AI = ~{SAVED_MIN_PER_REPLY} min pracy człowieka.</p>
        </div>
        <div className="card chart-card">
          <h3>Zużycie znaków</h3>
          <LineChart series={S.charsSeries} labels={S.labels} unit="znaków" color="var(--warn)" />
        </div>
        <div className="card chart-card">
          <h3>Trend konwersacji</h3>
          <LineChart series={S.convSeries} labels={S.labels} unit="konwersacji" />
        </div>
        <div className="card chart-card">
          <h3>Rozkład statusów</h3>
          <Donut
            items={[
              { label: 'Zakończone', value: S.byStatus.closed || 0, color: 'var(--ok)' },
              { label: 'Przekazane', value: S.byStatus.redirected || 0, color: 'var(--warn)' },
              { label: 'Otwarte', value: S.byStatus.open || 0, color: 'var(--acid)' },
            ]}
          />
          <div className="spacer" />
          <h3>Kanały</h3>
          <Bars
            items={Object.entries(S.byChannel).map(([k, v]) => ({
              label: k === 'widget' ? 'Widget WWW' : k[0].toUpperCase() + k.slice(1),
              value: v,
            }))}
          />
          {!Object.keys(S.byChannel).length && <p className="muted">Brak danych w tym okresie.</p>}
        </div>
      </div>
    </>
  )
}

// ── Sprzedawca: skuteczność bez pieniędzy (lidzi, wiadomości, odpowiedzi) ──
function SalesStats({ projId, days }) {
  const [data] = useCached('sales.stats', { project_id: projId, days })
  const S = useMemo(() => {
    if (!data) return null
    const leads = data.leads
    const msgs = data.messages
    const by = {}
    for (const l of leads) by[l.status] = (by[l.status] || 0) + 1
    const contactedEver = leads.filter((l) => !['new', 'paused'].includes(l.status)).length
    const repliedEver = (by.replied || 0) + (by.won || 0) + (by.handoff || 0) + (by.lost || 0)
    const responseRate = contactedEver ? Math.round((repliedEver / contactedEver) * 100) : 0
    const out = msgs.filter((m) => m.direction === 'out' && m.status === 'sent')
    const inc = msgs.filter((m) => m.direction === 'in')
    const failed = msgs.filter((m) => m.status === 'failed').length
    const daysArr = []
    for (let i = days - 1; i >= 0; i--) daysArr.push(dayKey(new Date(Date.now() - i * 864e5).toISOString()))
    const perDay = (rows) => {
      const map = Object.fromEntries(daysArr.map((d) => [d, 0]))
      for (const r of rows) {
        const k = dayKey(r.created_at)
        if (k in map) map[k]++
      }
      return daysArr.map((d) => map[d])
    }
    return {
      total: leads.length,
      by,
      unread: leads.filter((l) => l.unread).length,
      responseRate,
      out: out.length,
      inc: inc.length,
      failed,
      outSeries: perDay(out),
      incSeries: perDay(inc),
      labels: daysArr.map(fmtDay),
    }
  }, [data, days])

  if (!S) return <SkelStats n={6} />
  return (
    <>
      <div className="grid g4">
        <StatCard icon={<IcUser />} label="Lidzi w bazie" value={S.total} />
        <StatCard icon={<IcSend />} label="Wiadomości wysłane przez AI" value={S.out} />
        <StatCard icon={<IcMsg />} label="Odpowiedzi od klientów" value={S.inc} tone="var(--ok)" />
        <StatCard icon={<IcPulse />} label="Wskaźnik odpowiedzi" value={`${S.responseRate}%`} />
        <StatCard icon={<IcCheck />} label="Wygrane" value={S.by.won || 0} tone="var(--ok)" />
        <StatCard icon={<IcHandoff />} label="Przekazane człowiekowi" value={S.by.handoff || 0} tone="var(--warn)" />
        <StatCard icon={<IcX />} label="Przegrane / wypisani" value={(S.by.lost || 0) + (S.by.opt_out || 0)} />
        <StatCard icon={<IcEye />} label="Nieprzeczytane odpowiedzi" value={S.unread} tone={S.unread ? 'var(--warn)' : undefined} />
      </div>
      <div className="spacer" />
      <div className="grid gch">
        <div className="card chart-card">
          <h3>Wysłane przez AI</h3>
          <LineChart series={S.outSeries} labels={S.labels} unit="wiadomości" />
          {S.failed > 0 && <p className="chart-tip" style={{ color: 'var(--danger)' }}>Nieudane wysyłki w tym okresie: {S.failed} — sprawdź konfigurację kanałów.</p>}
        </div>
        <div className="card chart-card">
          <h3>Odpowiedzi klientów</h3>
          <LineChart series={S.incSeries} labels={S.labels} unit="odpowiedzi" color="var(--warn)" />
        </div>
        <div className="card chart-card">
          <h3>Statusy lidów</h3>
          <Donut
            items={[
              { label: 'Nowi', value: S.by.new || 0, color: 'var(--dim)' },
              { label: 'W kontakcie', value: S.by.contacted || 0, color: 'var(--acid)' },
              { label: 'Odpowiedzieli', value: S.by.replied || 0, color: 'var(--ok)' },
              { label: 'Wygrani', value: S.by.won || 0, color: '#4dd07a' },
              { label: 'Przegrani', value: (S.by.lost || 0) + (S.by.opt_out || 0), color: 'var(--danger)' },
              { label: 'Inni', value: (S.by.handoff || 0) + (S.by.paused || 0), color: 'var(--warn)' },
            ].filter((i) => i.value)}
          />
        </div>
        <div className="card chart-card">
          <h3>Lejek</h3>
          <Bars
            items={[
              { label: 'Wszyscy lidzi', value: S.total },
              { label: 'Skontaktowani', value: S.total - (S.by.new || 0) - (S.by.paused || 0), color: 'var(--acid)' },
              { label: 'Odpowiedzieli', value: (S.by.replied || 0) + (S.by.won || 0) + (S.by.handoff || 0), color: 'var(--warn)' },
              { label: 'Wygrani', value: S.by.won || 0, color: 'var(--ok)' },
            ]}
          />
          <p className="chart-tip">Statystyka bez pieniędzy — liczy kontakty i rozmowy, nie przychód.</p>
        </div>
      </div>
    </>
  )
}

const SAVED_MIN_LABEL = SAVED_MIN_PER_REPLY

function Conversations({ S, refetch }) {
  const [sel, setSel] = useState(null)
  const [msgs, setMsgs] = useState(null)

  async function openConv(c) {
    setSel(c)
    setMsgs(null)
    const d = await api('conv.messages', { conversation_id: c.id })
    setMsgs(d.messages)
  }
  async function closeConv() {
    await api('conv.close', { conversation_id: sel.id })
    setSel(null)
    refetch()
  }

  const badge = (s) =>
    s === 'closed' ? <span className="badge ok">Zakończona</span> : s === 'redirected' ? <span className="badge warn">Przekazana</span> : <span className="badge acid">Otwarta</span>

  return (
    <div className="grid" style={{ gridTemplateColumns: sel ? 'minmax(300px,1fr) minmax(320px,1.2fr)' : '1fr' }}>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Start</th>
              <th>Kanał</th>
              <th>Gość</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {S.convs.map((c) => (
              <tr key={c.id} onClick={() => openConv(c)} style={{ cursor: 'pointer' }}>
                <td>{new Date(c.started_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="mono" style={{ fontSize: 10.5 }}>{c.channel_type}</td>
                <td className="mono" style={{ fontSize: 10.5 }}>{c.visitor_id?.slice(0, 14) || '—'}</td>
                <td>{badge(c.status)}</td>
              </tr>
            ))}
            {!S.convs.length && (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 24 }}>
                  Brak konwersacji w wybranym okresie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          <div className="row" style={{ marginBottom: 12 }}>
            <b>Rozmowa</b> {badge(sel.status)}
            <span className="right row" style={{ gap: 8 }}>
              {sel.status === 'open' && (
                <button className="btn sm" onClick={closeConv}>
                  <IcCheck /> Zamknij
                </button>
              )}
              <button className="btn sm" onClick={() => setSel(null)}>
                <IcX />
              </button>
            </span>
          </div>
          <div className="chat-msgs" style={{ padding: 0 }}>
            {msgs === null && <SkelText lines={4} />}
            {msgs?.map((m) => (
              <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                {m.content}
                {m.role === 'assistant' && m.latency_ms ? (
                  <div className="mono" style={{ marginTop: 6, fontSize: 9.5, opacity: 0.7 }}>
                    {(m.latency_ms / 1000).toFixed(1)} s
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Costs({ S, wage, setWage }) {
  const aiCost = 0.01
  const humanCost = Math.max(0, Math.round((S.savedMin / 60) * wage * 100) / 100)
  return (
    <>
      <div className="grid g4">
        <StatCard icon={<IcClock />} label="Godziny pracy człowieka (oszczędzone)" value={(S.savedMin / 60).toFixed(1)} suffix="h" />
        <StatCard icon={<IcWallet />} label="Koszt Brain AI" value="<0,01" suffix="zł" tone="var(--ok)" />
        <StatCard icon={<IcUser />} label="Równowartość pracy człowieka" value={humanCost.toLocaleString('pl-PL')} suffix="zł" tone="var(--warn)" />
        <StatCard icon={<IcPulse />} label="Śr. czas odpowiedzi AI" value={S.avgLatency || '—'} suffix="s" />
      </div>
      <div className="spacer" />
      <div className="grid gch">
        <div className="card chart-card">
          <h3>Oszczędność narastająco</h3>
          <LineChart
            series={S.savedSeries.reduce((acc, v) => {
              acc.push((acc[acc.length - 1] || 0) + Math.round((v / 60) * wage))
              return acc
            }, [])}
            labels={S.labels}
            unit="zł"
          />
          <p className="chart-tip">Ile kosztowałaby ta sama praca człowieka, dzień po dniu (narastająco).</p>
        </div>
        <div className="card chart-card">
          <h3>Założenia porównania</h3>
          <label className="f">
            <span className="mono">Stawka godzinowa pracownika (zł/h)</span>
            <input type="number" min="1" value={wage} onChange={(e) => setWage(Number(e.target.value) || 0)} />
          </label>
          <p className="muted">
            Jedna odpowiedź AI liczona jako ~{SAVED_MIN_LABEL} min pracy człowieka. Koszt Brain AI przy własnej
            infrastrukturze jest pomijalny — stąd „&lt;0,01 zł".
          </p>
          <div className="spacer" />
          <Bars
            items={[
              { label: 'Brain AI', value: aiCost, color: 'var(--ok)' },
              { label: 'Pracownik (równowartość)', value: humanCost || 0.01, color: 'var(--warn)' },
            ]}
          />
        </div>
      </div>
    </>
  )
}
