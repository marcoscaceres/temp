/*globals console, async, importScripts */
"use strict";
const CACHE_NAME = "newtab-v2";
importScripts("async.js");

self.addEventListener("install", (ev) => {
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
  console.log("SW: Installing....");
  var populateCacheTask = async(function*() {
    var cache = yield caches.open(CACHE_NAME);
    cache.addAll(urlToCache);
    console.log("SW: done populating the cache.");
  });
  ev.waitUntil(populateCacheTask());
});

self.addEventListener('activate', function(event) {
  console.log("SW activated");
});

self.addEventListener("fetch", (ev) => {
  console.log("Fetch event!", ev)
  var lookInCacheTask = async(function*() {
    var response = yield caches.match(ev.request);
    return response || fetch(ev.request);
  });
  ev.respondWith(lookInCacheTask());
});
