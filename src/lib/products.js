// Produkty platformy obsługiwane przez TĘ domenę (rejestr `fiq_products`).
// Dawniej był tu jeden parasol „Agenci AI"; od 2026-09-08 to dwa osobne produkty,
// bo tylko dwaj agenci są zbudowani. AI Asystent (katalog #15) dojdzie tu, gdy
// powstanie jego moduł — wtedy wystarczy dopisać klucz i sekcję w menu.
export const PRODUCTS = ['advisor', 'sales']

// Nazwa awaryjna, gdy sesja jeszcze nie zna produktu (rejestr jest źródłem prawdy).
export const PRODUCT_FALLBACK = { key: 'advisor', sense: 'Brain', name: 'AI Doradca' }
