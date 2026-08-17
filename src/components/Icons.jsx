// Własny zestaw ikon SVG (stroke 24×24). Żadnych emoji.
const I = ({ children, ...p }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="square"
    strokeLinejoin="miter"
    aria-hidden="true"
    {...p}
  >
    {children}
  </svg>
)

export const IcDash = (p) => (
  <I {...p}>
    <rect x="3" y="3" width="8" height="8" />
    <rect x="13" y="3" width="8" height="5" />
    <rect x="13" y="10" width="8" height="11" />
    <rect x="3" y="13" width="8" height="8" />
  </I>
)
export const IcBot = (p) => (
  <I {...p}>
    <rect x="4" y="8" width="16" height="11" />
    <path d="M12 8V4M8 4h8" />
    <path d="M8.5 13h.01M15.5 13h.01" strokeWidth="2.6" />
    <path d="M9 16.5h6" />
  </I>
)
export const IcBook = (p) => (
  <I {...p}>
    <path d="M4 4h9v16H4zM13 4h7v16h-7" />
    <path d="M7 8h3M7 11h3" />
  </I>
)
export const IcGear = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19" />
  </I>
)
export const IcShield = (p) => (
  <I {...p}>
    <path d="M12 3l8 3v6c0 5-3.5 7.8-8 9-4.5-1.2-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4.5" />
  </I>
)
export const IcChat = (p) => (
  <I {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9h8M8 12h5" />
  </I>
)
export const IcSend = (p) => (
  <I {...p}>
    <path d="M3 11.5L21 4l-4.5 17-4.7-6.8L3 11.5z" />
    <path d="M11.8 14.2L21 4" />
  </I>
)
export const IcPlus = (p) => (
  <I {...p}>
    <path d="M12 5v14M5 12h14" />
  </I>
)
export const IcX = (p) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
)
export const IcCheck = (p) => (
  <I {...p}>
    <path d="M4 12.5l5.5 5.5L20 6.5" />
  </I>
)
export const IcTrash = (p) => (
  <I {...p}>
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
  </I>
)
export const IcEdit = (p) => (
  <I {...p}>
    <path d="M4 20l1-4L16.5 4.5l3 3L8 19l-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </I>
)
export const IcCopy = (p) => (
  <I {...p}>
    <rect x="8" y="8" width="12" height="12" />
    <path d="M16 8V4H4v12h4" />
  </I>
)
export const IcLink = (p) => (
  <I {...p}>
    <path d="M10 14L14 10" />
    <path d="M8 16l-2.5 2.5a3.5 3.5 0 01-5-5L3 11" transform="translate(4 -1)" />
    <path d="M16 8l2.5-2.5a3.5 3.5 0 015 5L21 13" transform="translate(-4 1)" />
  </I>
)
export const IcFile = (p) => (
  <I {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </I>
)
export const IcText = (p) => (
  <I {...p}>
    <path d="M4 6h16M4 11h16M4 16h10" />
  </I>
)
export const IcRefresh = (p) => (
  <I {...p}>
    <path d="M20 8A8 8 0 105.5 5.5" />
    <path d="M20 3v5h-5" />
  </I>
)
export const IcClock = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5.5l3.5 2" />
  </I>
)
export const IcUser = (p) => (
  <I {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c1.4-3.4 4.1-5 7.5-5s6.1 1.6 7.5 5" />
  </I>
)
export const IcUsers = (p) => (
  <I {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3 19c1.1-2.8 3.3-4.3 6-4.3s4.9 1.5 6 4.3" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M16.5 14.9c2.1.3 3.7 1.6 4.5 3.6" />
  </I>
)
export const IcLogout = (p) => (
  <I {...p}>
    <path d="M14 4H5v16h9" />
    <path d="M10 12h11M18 8.5l3.5 3.5-3.5 3.5" />
  </I>
)
export const IcSun = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
  </I>
)
export const IcMoon = (p) => (
  <I {...p}>
    <path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z" />
  </I>
)
export const IcMenu = (p) => (
  <I {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </I>
)
export const IcChevL = (p) => (
  <I {...p}>
    <path d="M14.5 5L8 12l6.5 7" />
  </I>
)
export const IcChevR = (p) => (
  <I {...p}>
    <path d="M9.5 5l6.5 7-6.5 7" />
  </I>
)
export const IcBox = (p) => (
  <I {...p}>
    <path d="M12 3l8 4v10l-8 4-8-4V7z" />
    <path d="M4 7l8 4 8-4M12 11v10" />
  </I>
)
export const IcFolder = (p) => (
  <I {...p}>
    <path d="M3 5h6l2 3h10v11H3z" />
  </I>
)
export const IcSpark = (p) => (
  <I {...p}>
    <path d="M12 2l2.2 6.5L21 11l-6.8 2.5L12 20l-2.2-6.5L3 11l6.8-2.5z" />
  </I>
)
export const IcGlobe = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5z" />
  </I>
)
export const IcPhone = (p) => (
  <I {...p}>
    <path d="M5 3h4l1.5 5-2.5 2a13 13 0 006 6l2-2.5 5 1.5v4c-9 1-17-7-16-16z" />
  </I>
)
export const IcWhatsApp = (p) => (
  <I {...p}>
    <path d="M12 3.5a8.5 8.5 0 00-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1012 3.5z" />
    <path d="M9 8.5c0 4 2.5 6.5 6.5 6.5l.8-1.8-2.3-1-.9.9c-1-.5-1.7-1.2-2.2-2.2l.9-.9-1-2.3z" strokeWidth="1.4" />
  </I>
)
export const IcInstagram = (p) => (
  <I {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4.5" />
    <circle cx="12" cy="12" r="3.6" />
    <path d="M16.8 7.2h.01" strokeWidth="2.6" />
  </I>
)
export const IcFacebook = (p) => (
  <I {...p}>
    <path d="M14.5 21v-7h2.8l.5-3.3h-3.3V8.6c0-1 .3-1.6 1.7-1.6h1.7V4.1C17.6 4 16.7 4 15.7 4c-2.6 0-4.3 1.6-4.3 4.4v2.3H8.5V14h2.9v7" />
  </I>
)
export const IcMsg = (p) => (
  <I {...p}>
    <path d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.7 0 2.4 1.2 4.6 3.1 6v3.3l3-1.7c.8.2 1.6.3 2.4.3 4.7 0 8.5-3.4 8.5-7.7S16.7 3.5 12 3.5z" />
    <path d="M7.5 12.5l3-3 2.5 2 3.5-3" strokeWidth="1.5" />
  </I>
)
export const IcArrowR = (p) => (
  <I {...p}>
    <path d="M4 12h15M13.5 5.5L20 12l-6.5 6.5" />
  </I>
)
export const IcHandoff = (p) => (
  <I {...p}>
    <path d="M4 8h11M11.5 4.5L15 8l-3.5 3.5" />
    <path d="M20 16H9M12.5 12.5L9 16l3.5 3.5" />
  </I>
)
export const IcWallet = (p) => (
  <I {...p}>
    <rect x="3" y="6" width="18" height="13" />
    <path d="M3 10h18M16 14.5h2" />
  </I>
)
export const IcPulse = (p) => (
  <I {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
  </I>
)
export const IcEye = (p) => (
  <I {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </I>
)
export const IcThumbUp = (p) => (
  <I {...p}>
    <path d="M7 10.5L11 3c1.5 0 2.5 1 2.5 2.5V9H19l1.5 2-1.8 8H7z" />
    <path d="M7 10.5V19H3.5v-8.5H7z" />
  </I>
)
export const IcThumbDown = (p) => (
  <I {...p}>
    <path d="M17 13.5L13 21c-1.5 0-2.5-1-2.5-2.5V15H5l-1.5-2 1.8-8H17z" />
    <path d="M17 13.5V5h3.5v8.5H17z" />
  </I>
)
export const IcKey = (p) => (
  <I {...p}>
    <circle cx="8" cy="14" r="4" />
    <path d="M11 11l8-8M15.5 6.5L18 9M13 9l2 2" />
  </I>
)
export const IcTarget = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 12h.01" strokeWidth="2.6" />
  </I>
)
export const IcMail = (p) => (
  <I {...p}>
    <rect x="3" y="5" width="18" height="14" />
    <path d="M3 7l9 6 9-6" />
  </I>
)
export const IcUpload = (p) => (
  <I {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 15v5h16v-5" />
  </I>
)
export const IcPause = (p) => (
  <I {...p}>
    <path d="M9 5v14M15 5v14" strokeWidth="2.2" />
  </I>
)
export const IcPlay = (p) => (
  <I {...p}>
    <path d="M7 4l13 8-13 8z" />
  </I>
)
