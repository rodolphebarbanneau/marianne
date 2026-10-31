import { createRoot } from 'react-dom/client'
import '@fontsource/vt323/latin.css'
import '@fontsource/vt323/latin-ext.css'
import '@fontsource-variable/jetbrains-mono'
import { watchErrors } from './lib/errors'
import { Root } from './root'
import './styles.css'

document.documentElement.dataset.platform = window.marianne.platform
watchErrors()

createRoot(document.getElementById('root')!).render(<Root />)
