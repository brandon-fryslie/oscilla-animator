import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Phase 4: Initialize unified transform registry
import { initializeTransforms } from './editor/transforms/registerAll'
initializeTransforms()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
