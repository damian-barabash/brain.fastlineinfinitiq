import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { consumeSso } from './shared/platform.js'
import './shared/design.css'

// Akcent tego produktu — design system czyta go z --product-accent.
document.documentElement.style.setProperty('--product-accent', '#B8FF00')

// Wejście z innego produktu przynosi sesję we fragmencie (#sso=…) — przejmujemy
// ją zanim cokolwiek się wyrenderuje, żeby Guard nie odesłał na /login.
consumeSso().finally(() => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})
