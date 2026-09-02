// Kopiuje wspólną warstwę z repozytorium fiq-shared do src/shared.
// ŹRÓDŁO PRAWDY: ../fiq-shared. Nie edytuj src/shared ręcznie — zmiany przepadną.
// Docelowo zastąpi to submoduł git (patrz README fiq-shared).
import { cpSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../fiq-shared/src')
const dst = resolve(here, '../src/shared')
if (!existsSync(src)) {
  console.error('Nie znaleziono fiq-shared w', src, '— sklonuj repozytorium obok aplikacji.')
  process.exit(1)
}
rmSync(dst, { recursive: true, force: true })
cpSync(src, dst, { recursive: true })
writeFileSync(resolve(dst, 'README.txt'), 'Kopia z fiq-shared. Nie edytuj — uruchom npm run sync:shared.\n')
console.log('fiq-shared → src/shared: zsynchronizowane')
