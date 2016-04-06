const fileListURL = 'file-list.json';
// we're controlling the lifecycle outself
self.skipWaiting();

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

function updateCheck() {
  return fetch(fileListURL).then(r => r.json()).then(fileList => {
    const staticCacheName = `static-separate-list-v${fileList.version}`;
    
    return caches.has(staticCacheName).then(cacheExists => {
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
  })
}

self.addEventListener('install', event => {
  event.waitUntil(
    // do an update check on install, but we don't really
    // care if it fails, as it'll try again at the next
    // navigate
    updateCheck().catch(() => null)
  );
});

self.addEventListener('fetch', event => {
  const responsePromise = caches.keys().then(cacheNames => {
    const staticCacheNames = cacheNames.filter(n => n.startsWith('static-separate-list-v'));
    
    // no caches, go to network
    if (!staticCacheNames[0]) return fetch(event.request);
    
    let staticCacheName = staticCacheNames[0];
    
    return Promise.resolve().then(() => {
      if (staticCacheNames.length == 1 || event.request.mode != 'navigate') return;
      // more than one static cache? Can we expire the old one?
      return clients.matchAll().then(clients => {
        // TODO: I would have expected zero clients for initial navigation, but seems like it's 1
        // I need to investigate this & find out if it's a spec or Chrome issue
        if (clients.length > 1) return;
        // Ohh, we can use the new cache!
        staticCacheName = staticCacheNames[staticCacheNames.length - 1];
        // delete the others
        return Promise.all(
          staticCacheNames.slice(0, -1).map(c => caches.delete(c))
        );
      })
    }).then(() => {
      return caches.open(staticCacheName).then(c => c.match(event.request))
        .then(response => response || fetch(event.request));
    });
  });
  
  if (event.request.mode == 'navigate') {
    // allow the main request to complete, then check for updates
    event.waitUntil(responsePromise.then(updateCheck));
  }
  
  event.respondWith(responsePromise);
});