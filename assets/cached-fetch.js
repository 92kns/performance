(function() {
  var CF_PREFIX = 'cf:';
  var SIG_TTL = 30 * 60 * 1000;
  var DEFAULT_TTL = 15 * 60 * 1000;
  var DB_NAME = 'perfDashCache';
  var STORE_NAME = 'responses';
  var dbReady = null;

  function getTTL(url) {
    return url.includes('/performance/signatures/') ? SIG_TTL : DEFAULT_TTL;
  }

  function openDB() {
    if (dbReady) return dbReady;
    dbReady = new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        e.target.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function() { reject(req.error); };
    });
    return dbReady;
  }

  function cacheGet(key) {
    return openDB().then(function(db) {
      return new Promise(function(resolve) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var r = tx.objectStore(STORE_NAME).get(key);
        r.onsuccess = function() { resolve(r.result || null); };
        r.onerror = function() { resolve(null); };
      });
    }).catch(function() { return null; });
  }

  function cachePut(key, data) {
    openDB().then(function(db) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ ts: Date.now(), data: data }, key);
    }).catch(function() {});
  }

  window.cachedFetch = function(url) {
    var key = CF_PREFIX + url;

    return cacheGet(key).then(function(entry) {
      if (entry && (Date.now() - entry.ts < getTTL(url))) {
        return {
          ok: true,
          status: 200,
          json: function() { return Promise.resolve(entry.data); }
        };
      }

      return fetch(url).then(function(response) {
        if (!response.ok) return response;

        var cloned = response.clone();
        return cloned.json().then(function(data) {
          cachePut(key, data);
          return {
            ok: true,
            status: 200,
            json: function() { return Promise.resolve(data); }
          };
        }).catch(function() {
          return response;
        });
      });
    });
  };
  window.clearFetchCache = function() {
    indexedDB.deleteDatabase(DB_NAME);
    location.reload();
  };
})();
