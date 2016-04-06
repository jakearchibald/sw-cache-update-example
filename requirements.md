# Write a service worker which:

* On page navigation, checks for updates
* If update found, populate cache from a list of files
* Cache-bust the fetching when populating the cache
* Allow the new cache to come into play once there are no existing controlled clients
* Serve files cache-first