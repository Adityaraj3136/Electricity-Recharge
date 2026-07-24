import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { runIntegrityChecks } from './integrity'

// Run integrity checks first, then mount the app only if all pass
runIntegrityChecks().then((isClean) => {
  if (!isClean) return; // showTamperWarning() already replaced the DOM

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
