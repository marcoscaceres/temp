"use strict";

importScripts("async.js");

const CACHE_NAME = "newtab-v2";
const urlToCache = [
  "../css/newTab.css",
  "../css/newTab.inc.css",
  "../js/async.js",
  "../js/cells.js",
  "../js/customize.js",
  "../js/drag.js",
  "../js/dragDataHelper.js",
  "../js/drop.js",
  "../js/dropPreview.js",
  "../js/dropTargetShim.js",
  "../js/grid.js",
  "../js/newTab.js",
  "../js/page.js",
  "../js/rect.js",
  "../js/sites.js",
  "../js/transformations.js",
  "../js/undo.js",
  "../js/updater.js",
  "../locale/newTab.json",
  "../newTab.html"
];

self.addEventListener("install", (ev) => {
  console.log("SW: Installing....")
  var populateCacheTask = async(function*() {
    const cache = yield caches.open(CACHE_NAME);
    cache.addAll(urlToCache);
    console.log("SW: done populating the cache");
  });
  ev.waitUntil(populateCacheTask());
});


self.addEventListener("fetch", (ev) => {
  console.log("fetch event!", ev)
  var lookInCacheTask = async(function*() {
    const response = yield caches.match(ev.request)
    // Cache hit - return response
    if (response) {
      console.log("SW: responding from cache");
      return response;
    }
    console.log("SW: responding from network");
    return fetch(ev.request);
  });
  ev.respondWith(lookInCacheTask());
});
