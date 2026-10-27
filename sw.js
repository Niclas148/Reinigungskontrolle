// Service Worker: macht die Seite installierbar und lädt die Oberfläche
// auch bei schwachem Netz. Daten (Firebase) werden NIE zwischengespeichert.
const CACHE = "reinigung-v4";
const DATEIEN = ["./", "index.html", "style.css", "app.js", "hilfen.js", "kalender.js", "auswertung.js",
  "export.js", "datastore.js", "firebase-config.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Immer zuerst aus dem Netz (damit Updates sofort ankommen), nur bei Ausfall aus dem Cache.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(e.request))
  );
});
