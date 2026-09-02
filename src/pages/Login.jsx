// Logowanie wspólne dla platformy (fiq-shared) — Brain podaje tylko swoją nazwę.
import SharedLogin from '../shared/Login.jsx'

export default function Login() {
  return <SharedLogin product="Brain" tagline="Cyfrowi pracownicy. Zaloguj się, aby kontynuować." />
}
