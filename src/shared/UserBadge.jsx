// Kto jest zalogowany — zawsze w prawym górnym rogu każdego panelu platformy
// (Brain, Hand, kolejne): awatar z animowanym gradientem, imię i rola.
// Kolory awatara losuje baza przy założeniu konta (brain_users.avatar: h1/h2/h3/a);
// dla starej sesji bez tych pól liczymy je z id — stabilnie, żeby nie migotało.
import { session } from './platform.js'

const ROLE = { admin: 'Administrator', client: 'Klient' }

function hues(user) {
  const a = user?.avatar
  if (a && Number.isFinite(+a.h1)) return { h1: +a.h1, h2: +a.h2, h3: +a.h3, a: +a.a || 0 }
  let x = 7
  for (const ch of String(user?.id || user?.login || 'fiq')) x = (x * 31 + ch.charCodeAt(0)) >>> 0
  return { h1: x % 360, h2: (x >> 3) % 360, h3: (x >> 7) % 360, a: (x >> 11) % 360 }
}

export default function UserBadge({ user: given }) {
  const user = given || session.user
  if (!user) return null
  const h = hues(user)
  const name = user.display_name || user.login || '—'
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
  const style = {
    '--ub-h1': h.h1,
    '--ub-h2': h.h2,
    '--ub-h3': h.h3,
    '--ub-a': `${h.a}deg`,
  }
  return (
    <div className="ubadge" style={style} title={`${name} · ${ROLE[user.role] || user.role}`}>
      <span className="ub-avatar" aria-hidden="true">
        <span className="ub-ring" />
        <span className="ub-core">{initials}</span>
      </span>
      <span className="ub-text">
        <b className="ub-name">{name}</b>
        <span className="ub-role mono">{ROLE[user.role] || user.role}</span>
      </span>
    </div>
  )
}
