// Service worker do sistema da Fazenda Ouro Branco.
// Mesmo princípio do Gefoscal: o sistema depende do banco o tempo
// todo, então isso não dá funcionamento "offline de verdade" — só
// deixa o app instalável (ícone, tela cheia) e guarda em cache o
// esqueleto da página pra abrir mais rápido.
const CACHE = 'fazenda-ouro-branco-v1'
const ARQUIVOS_ESQUELETO = ['./index.html', './app.js', './manifest.json']

self.addEventListener('install', (evento) => {
  self.skipWaiting()
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS_ESQUELETO).catch(() => {}))
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return
  evento.respondWith(
    fetch(evento.request).catch(() => caches.match(evento.request))
  )
})
