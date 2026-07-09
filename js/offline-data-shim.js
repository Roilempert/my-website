/* ==========================================================================
   Offline data shim — run the site with NO server (double-click the HTML).

   Chrome blocks fetch() of local files under the file:// protocol, which is
   the only reason this site normally needs a local web server. This shim
   intercepts fetch() for the site's data/asset files and serves them from a
   baked-in registry (window.__EMBEDDED_DATA__, produced by
   build-embedded-data.sh → data/embedded-data.js).

   Load order in each HTML page (all defer):
     1. js/offline-data-shim.js   (this file — patches fetch)
     2. data/embedded-data.js     (fills window.__EMBEDDED_DATA__)
     3. js/config.js, app scripts (their fetch() calls hit the registry)

   The registry is read at call time, so it may be filled after this shim
   runs. Any URL not in the registry falls through to the real fetch().

   DEV NOTE: This shim only activates under the file:// protocol (double-click,
   no server). When served over http(s):// — i.e. during development with a
   local server — it stays inert, so edits to data/*.csv and the fetched SVGs
   are always live and you never need to rebuild data/embedded-data.js while
   working. Refresh the baked snapshot only before shipping the offline build.
   ========================================================================== */
(function () {
    if (typeof window === 'undefined' || window.__OFFLINE_FETCH_PATCHED__) return;

    // Only intercept when running straight from disk (file://). Under a real
    // server the browser can fetch local files normally — leave fetch() alone.
    var isFileProtocol = (typeof location !== 'undefined' && location.protocol === 'file:');
    if (!isFileProtocol) return;

    window.__OFFLINE_FETCH_PATCHED__ = true;
    window.__EMBEDDED_DATA__ = window.__EMBEDDED_DATA__ || {};

    var realFetch = (typeof window.fetch === 'function') ? window.fetch.bind(window) : null;

    // Strip query/hash and any leading ./ or / so relative and absolute
    // (file://) URLs normalize to the same registry keys (e.g. "data/main.csv").
    function normalizeKey(url) {
        var s = String(url).split('#')[0].split('?')[0];
        return s.replace(/^\.\//, '').replace(/^\//, '');
    }

    // Match by exact key first, then by suffix so an absolute
    // file:///Users/.../data/main.csv still resolves to "data/main.csv".
    function lookup(url) {
        var store = window.__EMBEDDED_DATA__ || {};
        var key = normalizeKey(url);
        if (Object.prototype.hasOwnProperty.call(store, key)) return store[key];
        for (var k in store) {
            if (Object.prototype.hasOwnProperty.call(store, k) && key.length >= k.length && key.slice(-k.length) === k) {
                return store[k];
            }
        }
        return null;
    }

    function contentType(url) {
        var u = url.toLowerCase();
        if (u.indexOf('.json') !== -1) return 'application/json; charset=utf-8';
        if (u.indexOf('.csv') !== -1) return 'text/csv; charset=utf-8';
        if (u.indexOf('.svg') !== -1) return 'image/svg+xml';
        return 'text/plain; charset=utf-8';
    }

    function respond(body, url) {
        if (typeof Response === 'function') {
            return Promise.resolve(new Response(body, {
                status: 200,
                statusText: 'OK',
                headers: { 'Content-Type': contentType(url) }
            }));
        }
        // Minimal Response-like fallback for very old engines.
        return Promise.resolve({
            ok: true,
            status: 200,
            url: url,
            text: function () { return Promise.resolve(body); },
            json: function () { return Promise.resolve(JSON.parse(body)); }
        });
    }

    window.fetch = function (input, init) {
        var url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
        try {
            var hit = lookup(url);
            if (hit != null) {
                var body = (typeof hit === 'string') ? hit : JSON.stringify(hit);
                return respond(body, String(url));
            }
        } catch (err) {
            /* fall through to real fetch below */
        }
        if (realFetch) return realFetch(input, init);
        return Promise.reject(new Error('Offline: no embedded data for ' + url));
    };
})();
