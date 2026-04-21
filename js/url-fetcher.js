// =====================
// URL FETCHER (CORS-safe, best-effort)
// =====================
// Tries to fetch a listing URL via public CORS proxies.
// Returns { ok: true, html: "...", proxyUsed: "..." } on success.
// Returns { ok: false, reason: "..." } on failure.
//
// IMPORTANT: Because this is a static GitHub Pages site, direct
// fetches to auctioninc.co.za will fail with CORS errors. We rely
// on public proxies which CAN and DO go down or rate-limit.
// Callers MUST handle failure gracefully and fall back to the
// paste-source workflow.
//
// Exposed as window.AI_fetchListingUrl.

(function () {
  'use strict';

  // Public CORS proxies (first that works wins).
  // These are best-effort — any of them may disappear.
  // Order matters: most reliable first.
  const PROXY_STRATEGIES = [
    {
      name: 'allorigins-raw',
      build: (url) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
      extract: async (res) => await res.text()
    },
    {
      name: 'allorigins-json',
      build: (url) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(url),
      extract: async (res) => {
        const data = await res.json();
        return (data && data.contents) ? data.contents : '';
      }
    },
    {
      name: 'corsproxy-io',
      build: (url) => 'https://corsproxy.io/?' + encodeURIComponent(url),
      extract: async (res) => await res.text()
    }
  ];

  const FETCH_TIMEOUT_MS = 12000;

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout after ' + ms + 'ms')), ms);
      promise
        .then(v => { clearTimeout(timer); resolve(v); })
        .catch(e => { clearTimeout(timer); reject(e); });
    });
  }

  function looksLikeHtml(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return lower.indexOf('<html') !== -1 ||
           lower.indexOf('<!doctype') !== -1 ||
           lower.indexOf('<body') !== -1 ||
           lower.indexOf('<head') !== -1;
  }

  function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  /**
   * Fetch URL via chain of proxies. Resolves with first success.
   * Never throws — returns failure object instead.
   */
  async function fetchListingUrl(url) {
    if (!isValidUrl(url)) {
      return { ok: false, reason: 'Invalid URL' };
    }

    const attempts = [];

    for (const strategy of PROXY_STRATEGIES) {
      const proxyUrl = strategy.build(url);
      try {
        const res = await withTimeout(
          fetch(proxyUrl, {
            method: 'GET',
            // Do not send credentials — proxies don't want them
            credentials: 'omit',
            // Hint to cache where possible
            cache: 'no-store',
            redirect: 'follow'
          }),
          FETCH_TIMEOUT_MS
        );

        if (!res.ok) {
          attempts.push(`${strategy.name}: HTTP ${res.status}`);
          continue;
        }

        const text = await strategy.extract(res);

        if (!text || text.length < 200) {
          attempts.push(`${strategy.name}: empty response`);
          continue;
        }

        if (!looksLikeHtml(text)) {
          // Proxy returned something, but not HTML (e.g. error page)
          attempts.push(`${strategy.name}: non-HTML response`);
          continue;
        }

        return { ok: true, html: text, proxyUsed: strategy.name };

      } catch (err) {
        attempts.push(`${strategy.name}: ${err && err.message ? err.message : err}`);
        continue;
      }
    }

    return {
      ok: false,
      reason: 'All proxies failed',
      details: attempts
    };
  }

  window.AI_fetchListingUrl = fetchListingUrl;
  window.AI_isValidUrl = isValidUrl;
})();
