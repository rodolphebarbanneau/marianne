import { createRoot } from 'react-dom/client'
import '@fontsource/vt323/latin.css'
import '@fontsource/vt323/latin-ext.css'
import '@fontsource-variable/jetbrains-mono'
import { App } from './app/app'
import { BrowserBar } from './browser/browser-bar'
import './styles.css'

const view = location.hash.slice(1) || 'main'
document.documentElement.dataset.view = view
document.documentElement.dataset.platform = window.marianne.platform
document.title = view === 'browser' ? 'Marianne · navigateur' : 'Marianne'

createRoot(document.getElementById('root')!).render(view === 'browser' ? <BrowserBar /> : <App />)
