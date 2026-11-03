import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles.css'
import App from './App'
import { AuthProvider } from './lib/auth'
import { UiProviders } from './components/ui'

try { document.documentElement.dataset.theme = JSON.parse(localStorage.getItem('iti.theme')) || 'light' } catch { document.documentElement.dataset.theme = 'light' }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <UiProviders>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UiProviders>
    </HashRouter>
  </React.StrictMode>
)
