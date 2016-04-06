const fileList = {
  "version": 1,
  "files": [
    "./",
    "subresources/foo.txt",
    "subresources/hello.txt"
  ]
};

const staticCacheName = `static-no-separate-list-v${fileList.version}`;

// A little hack for cache busting until the `cache` option is supported
function fetchAndBust(request) {
  if (typeof request == 'string') request = new Request(request);
  const url = new URL(request.url);
  url.search += Math.random();
  
  return fetch(url, {
    headers: request.headers,
    mode: request.mode,
    credentials: request.credentials,
    redirect: request.redirect
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.has(staticCacheName).then(cacheExists => {
      // don't recache if the version number hasn't changed
      if (cacheExists) return;
      
      // cache-bust-fetch everything
      return Promise.all(fileList.files.map(fetchAndBust)).then(responses => {
        return caches.open(staticCacheName).then(cache => {
          return Promise.all(
            responses.map((response, i) => {
              // throw if 404 etc
              if (!response.ok) throw Error('Not ok');
              // store the responses under their original url
              return cache.put(fileList.files[i], response);
            })
          )
        })
      })
      .catch(err => {
        // it went wrong, ditch the cache
        caches.delete(staticCacheName);
        throw err;
      });
    })
    
  );
});

// ditch old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName.startsWith('static-no-separate-list-v') && cacheName !== staticCacheName) return caches.delete(cacheName);
      })
    ))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open(staticCacheName).then(c => c.match(event.request))
      .then(response => response || fetch(event.request))
  );
});