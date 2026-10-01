import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 字体与第三方样式表统一由 index.css 的 @import 收口：同一张样式表若在这里再用
// JS 副作用引入一次，打包器会当成另一个模块并输出第二份副本，既让产物膨胀，
// 也会让后出现的那份反向覆盖自定义规则（详见 canvas/__tests__/vendor-css-import-guard.test.ts）。
import './index.css'
import { AppProviders } from './app/providers'
import { migrateLegacyPrivateKeys } from './features/tenant-key'

// 处理部署后旧 chunk 失效导致的动态导入失败，自动刷新页面加载最新资源
window.addEventListener('vite:preloadError', () => {
  const key = 'chunk-reload'
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, '1')
    window.location.reload()
  }
})

// 一次性把旧版明文私钥记录改写为不可导出 CryptoKey；失败的记录原样保留，只记日志，不阻塞启动。
void migrateLegacyPrivateKeys()
  .then(({ failed }) => {
    for (const { fingerprint, stage, error } of failed) {
      console.error(`私钥 ${fingerprint} 迁移失败（${stage}），已保留旧记录`, error)
    }
  })
  .catch((error: unknown) => {
    console.error('私钥存储迁移失败', error)
  })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
