// Wybór produkt → workspace → projekt. Ekran jest wspólny dla całej platformy
// (fiq-shared/src/Picker.jsx) — tutaj tylko wpinamy go w router Brain.
import { useNavigate } from 'react-router-dom'
import SharedPicker from '../shared/Picker.jsx'

export default function Picker() {
  const nav = useNavigate()
  return <SharedPicker productKey="brain" onDone={() => nav('/app', { replace: true })} />
}
