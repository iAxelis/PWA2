const CACHE_NAME = "pokedex-pwa-v1";
const API_ORIGIN = "https://pokeapi.co";
const APP_SHELL = [
    "./index.html",
    "./manifest.json",
    "./Css/styles.css",
    "./JavaScript/app.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName.startsWith("pokedex-pwa-") && cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== "GET") {
        return;
    }

    if (requestUrl.origin === API_ORIGIN) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                try {
                    const response = await fetch(event.request);
                    if (response.ok) {
                        await cache.put(event.request, response.clone())
                            .catch((error) => console.error("No se pudo guardar una respuesta de PokéAPI para uso sin conexión.", error));
                    }
                    return response;
                } catch (error) {
                    const cachedResponse = await cache.match(event.request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    throw error;
                }
            })()
        );
        return;
    }

    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put("./index.html", copy))
                        .catch((error) => console.error("No se pudo actualizar la página guardada para uso sin conexión.", error));
                }
                return response;
            })
                .catch(async () => {
                    const cachedPage = await caches.match(event.request);
                    return cachedPage || caches.match("./index.html");
                })
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => cachedResponse || fetch(event.request))
    );
});