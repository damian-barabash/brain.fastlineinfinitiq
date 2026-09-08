// Wybór produkt → workspace → projekt. Ekran jest wspólny dla całej platformy
// (fiq-shared/src/Picker.jsx) — tutaj tylko wpinamy go w router Brain.
import { useNavigate } from 'react-router-dom'
import SharedPicker from '../shared/Picker.jsx'
import { PRODUCTS } from '../lib/products.js'

// Ta domena obsługuje dwa produkty (AI Doradca, AI Sprzedawca), więc wybór
// któregokolwiek z nich NIE jest przejściem domenowym — zostajemy na miejscu.
export default function Picker() {
  const nav = useNavigate()
  return (
    <SharedPicker
      productKey={PRODUCTS[0]}
      localKeys={PRODUCTS}
      onDone={() => nav('/app', { replace: true })}
    />
  )
}
