import { createApiMiddleware } from './api.js'

// Plugin de Vite: monta la API de Node dentro del servidor local
export function rhythmApi() {
  return {
    name: 'rhythm-api',
    configureServer(server) { server.middlewares.use('/api', createApiMiddleware()) },
    configurePreviewServer(server) { server.middlewares.use('/api', createApiMiddleware()) },
  }
}
