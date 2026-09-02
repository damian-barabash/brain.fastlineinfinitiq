// ── Szkielety ładowania ─────────────────────────────────────────────────────
// Pusty ekran przez trzy sekundy wygląda jak zepsuta strona. Zamiast tego
// pokazujemy kształt treści, która zaraz przyjdzie: te same karty, te same
// wysokości, ten sam rytm. Dzięki temu nic nie „przeskakuje" po wczytaniu.
// Animacja jest jedna (przesuwający się połysk) i żyje w design.css.

export function Skel({ w = '100%', h = 14, r = 0, style }) {
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

// Akapit: ostatnia linia krótsza, tak jak w prawdziwym tekście.
export function SkelText({ lines = 3, w = '100%' }) {
  return (
    <span className="skel-lines" style={{ width: w }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skel key={i} h={12} w={i === lines - 1 ? '62%' : '100%'} />
      ))}
    </span>
  )
}

export function SkelCard({ lines = 3, head = true, children }) {
  return (
    <div className="card skel-card">
      {head && (
        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <Skel w={18} h={18} />
          <Skel w="42%" h={15} />
        </div>
      )}
      {children ?? <SkelText lines={lines} />}
    </div>
  )
}

// Kafelki z liczbami — dokładnie taki układ jak .stat, żeby nie było przeskoku.
export function SkelStats({ n = 4 }) {
  return (
    <div className="grid g4">
      {Array.from({ length: n }).map((_, i) => (
        <div className="stat skel-card" key={i}>
          <span className="ic">
            <Skel w={20} h={20} />
          </span>
          <span style={{ display: 'grid', gap: 8, flex: 1 }}>
            <Skel w="70%" h={11} />
            <Skel w="40%" h={20} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function SkelChart({ h = 220, title = true }) {
  return (
    <div className="card skel-card">
      {title && <Skel w="34%" h={14} style={{ marginBottom: 14 }} />}
      <Skel w="100%" h={h} />
    </div>
  )
}

export function SkelList({ rows = 4, height = 46 }) {
  return (
    <div className="skel-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="row skel-row" key={i} style={{ gap: 12 }}>
          <Skel w={18} h={18} />
          <span style={{ display: 'grid', gap: 7, flex: 1 }}>
            <Skel w={`${70 - i * 6}%`} h={13} />
            <Skel w={`${45 - i * 4}%`} h={10} />
          </span>
          <Skel w={64} h={height / 2.6} />
        </div>
      ))}
    </div>
  )
}

// Formularz: etykieta + pole, powtórzone. Używane tam, gdzie ładuje się konfiguracja.
export function SkelForm({ fields = 4 }) {
  return (
    <div className="skel-form">
      {Array.from({ length: fields }).map((_, i) => (
        <span key={i} style={{ display: 'grid', gap: 6 }}>
          <Skel w="30%" h={10} />
          <Skel w="100%" h={38} />
        </span>
      ))}
      <Skel w={150} h={38} />
    </div>
  )
}

// Nagłówek strony — tytuł i podtytuł, żeby góra ekranu nie skakała.
export function SkelHead() {
  return (
    <div className="pagehead">
      <div style={{ display: 'grid', gap: 10 }}>
        <Skel w={160} h={11} />
        <Skel w={260} h={30} />
        <Skel w={340} h={12} />
      </div>
    </div>
  )
}

// Gotowy ekran „strona się ładuje" — nagłówek + kafelki + wykresy.
export function SkelPage({ stats = 0, cards = 2, charts = 0, head = true }) {
  return (
    <>
      {head && <SkelHead />}
      {stats > 0 && (
        <>
          <SkelStats n={stats} />
          <div className="spacer" />
        </>
      )}
      {cards > 0 && (
        <div className="grid g2">
          {Array.from({ length: cards }).map((_, i) => (
            <SkelCard key={i} lines={4} />
          ))}
        </div>
      )}
      {charts > 0 && (
        <>
          <div className="spacer" />
          <div className="grid gch">
            {Array.from({ length: charts }).map((_, i) => (
              <SkelChart key={i} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
