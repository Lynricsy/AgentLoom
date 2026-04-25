import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/noto-sans-sc'
import './index.css'
import { AppProviders } from './app/providers'

// 处理部署后旧 chunk 失效导致的动态导入失败，自动刷新页面加载最新资源
window.addEventListener('vite:preloadError', () => {
  const key = 'chunk-reload'
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1')
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
