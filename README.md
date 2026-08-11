# brain.fastlineinfinitiq

Panel „Brain" — cyfrowi pracownicy Fastline InfinitiQ (AI-doradca + baza wiedzy + analityka + widget czatu).

- Front: React 18 + Vite → GitHub Pages (`brain.fastlineinfinitiq.pl`, workflow w `.github/workflows/deploy.yml`)
- Backend: Supabase `ogxajgbrbkfwsactlsyj` (tabele `brain_*`, bucket `brain-kb`, edge: `brain-admin` / `brain-chat` / `brain-hook`)
- AI: Barabash AI gateway (klucz `fiq-brain`, sekret `BRAIN_AI_KEY`), provider OpenAI-compatible — konfigurowalny w panelu (Admin → Dostawca AI)
- Widget na stronę klienta: `public/widget.js` (data-key / data-color / data-position, tryb WhatsApp)

Dev: `npm install && npm run dev`. Build: `npm run build`.
