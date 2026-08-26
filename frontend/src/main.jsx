import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from './LanguageContext.jsx'
import { CustomThemeProvider } from './ThemeContext.jsx'
import { LoadingProvider } from './LoadingContext.jsx' // 👈 استدعاء الـ LoadingProvider
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <CustomThemeProvider>
        <LoadingProvider> 
          <App />
        </LoadingProvider>
      </CustomThemeProvider>
    </LanguageProvider>
  </StrictMode>,
)