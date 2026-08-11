// Własne wykresy SVG w stylu FIQ (bez bibliotek).
import { useId, useState } from 'react'

const AXIS = 'var(--dim2)'
const GRID = 'var(--line)'

export function LineChart({ series, height = 220, color = 'var(--acid)', unit = '', labels = [] }) {
  // series: number[] — jedna linia dzienna; labels: string[] pod osią
  const gid = useId()
  const [hover, setHover] = useState(null)
  const W = 900
  const H = height
  const padL = 36
  const padB = 26
  const padT = 12
  const n = series.length
  const max = Math.max(4, ...series)
  const x = (i) => padL + (i * (W - padL - 8)) / Math.max(1, n - 1)
  const y = (v) => padT + (H - padT - padB) * (1 - v / max)
  const path = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = n > 1 ? `${path} L${x(n - 1)},${H - padB} L${x(0)},${H - padB} Z` : ''
  const ticks = 4
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width) * W
        const i = Math.round(((px - padL) / (W - padL - 8)) * (n - 1))
        setHover(i >= 0 && i < n ? i : null)
      }}
    >
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: ticks + 1 }, (_, t) => {
        const v = (max / ticks) * t
        return (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke={GRID} strokeDasharray="3 5" />
            <text x={padL - 8} y={y(v) + 4} fill={AXIS} fontSize="11" textAnchor="end" fontFamily="IBM Plex Mono">
              {Math.round(v)}
            </text>
          </g>
        )
      })}
      {labels.map((l, i) =>
        i % Math.ceil(n / 8) === 0 ? (
          <text key={i} x={x(i)} y={H - 8} fill={AXIS} fontSize="10.5" textAnchor="middle" fontFamily="IBM Plex Mono">
            {l}
          </text>
        ) : null,
      )}
      {area && <path d={area} fill={`url(#g${gid})`} />}
      {n > 1 && <path d={path} fill="none" stroke={color} strokeWidth="2" />}
      {n === 1 && <circle cx={x(0)} cy={y(series[0])} r="4" fill={color} />}
      {hover != null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--line-strong)" />
          <circle cx={x(hover)} cy={y(series[hover])} r="4.5" fill={color} />
          <g
            transform={`translate(${Math.min(W - 190, Math.max(padL, x(hover) - 80))}, ${padT + 6})`}
            fontFamily="IBM Plex Mono"
          >
            <rect width="170" height="44" fill="var(--panel2)" stroke="var(--line-strong)" />
            <text x="10" y="18" fill="var(--dim)" fontSize="10.5">
              {labels[hover] || ''}
            </text>
            <text x="10" y="34" fill={color} fontSize="12">
              {series[hover]} {unit}
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}

export function Bars({ items, height = 160 }) {
  // items: [{label, value, color?}] — poziome paski z wartością
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12.5, color: 'var(--dim)' }}>{it.label}</span>
            <span className="mono" style={{ color: it.color || 'var(--acid)' }}>
              {it.value}
            </span>
          </div>
          <div style={{ height: 7, background: 'var(--panel2)', border: '1px solid var(--line)' }}>
            <div
              style={{
                height: '100%',
                width: `${(it.value / max) * 100}%`,
                background: it.color || 'var(--acid)',
                transition: 'width .5s cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Donut({ items, size = 168 }) {
  // items: [{label, value, color}]
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const R = 56
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--panel2)" strokeWidth="16" />
        {items.map((it, i) => {
          const frac = it.value / total
          const dash = `${frac * C} ${C}`
          const off = -acc * C
          acc += frac
          return (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={it.color}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={off}
              transform="rotate(-90 70 70)"
            />
          )
        })}
        <text x="70" y="66" textAnchor="middle" fill="var(--text)" fontSize="24" fontFamily="Archivo" fontWeight="900">
          {total === 1 && items.every((i) => !i.value) ? 0 : total}
        </text>
        <text x="70" y="84" textAnchor="middle" fill="var(--dim)" fontSize="10" fontFamily="IBM Plex Mono">
          RAZEM
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, background: it.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--dim)' }}>{it.label}</span>
            <span className="mono" style={{ color: 'var(--text)' }}>
              {it.value} ({Math.round((it.value / total) * 100) || 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatCard({ icon, label, value, suffix, tone }) {
  return (
    <div className="stat">
      <div className="ic" style={tone ? { color: tone, borderColor: tone, background: 'transparent' } : undefined}>
        {icon}
      </div>
      <div>
        <div className="lbl">{label}</div>
        <div className="val">
          {value}
          {suffix ? <small> {suffix}</small> : null}
        </div>
      </div>
    </div>
  )
}
