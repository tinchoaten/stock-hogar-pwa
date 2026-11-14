import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { AppProvider } from './store'

registerSW({ immediate: true })

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || String(e) }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 24, color: '#f1f5f9' }}>
        <h2 style={{ fontWeight: 700, fontSize: 20 }}>Algo falló</h2>
        <p style={{ marginTop: 8, color: '#f87171', wordBreak: 'break-word' }}>{this.state.error}</p>
        <button
          onClick={() => location.reload()}
          style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, background: '#059669', color: '#fff', fontWeight: 700 }}
        >
          Recargar
        </button>
      </div>
    )
  }
}

// Pide a iOS/Android que no borre el almacenamiento local (ajustes, clave, cola de envíos).
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
)
