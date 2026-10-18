// Petit « service worker » de bfmobility (application Android installable, PWABuilder / TWA).
// Son seul rôle : quand l'ouverture d'une page échoue faute d'Internet, afficher la page « Pas de connexion »
// (offline.html) au lieu de l'erreur du navigateur. Rien d'autre n'est mis en cache : le site reste toujours
// à jour (aucune ancienne version n'est servie).
const CACHE_HORS_LIGNE = "bfm-hors-ligne-1";

// Installation : on garde de côté la seule page hors connexion
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_HORS_LIGNE).then((c) => c.add("/offline.html")).catch(() => {}));
  self.skipWaiting();
});

// Activation : prise de contrôle immédiate des pages ouvertes
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Ouverture d'une page (navigation) : on essaie le réseau ; en cas d'échec, on montre la page hors connexion.
// Les appels au serveur (API, images, scripts) ne passent pas par ici : ils ne sont jamais interceptés.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html").then((r) => r || Response.error())));
});
