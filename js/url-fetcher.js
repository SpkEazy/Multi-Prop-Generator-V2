// =====================
// URL FETCHER (CORS-safe, best-effort)
// =====================
// Tries multiple public CORS proxies. Returns the first success.
// Never throws — failures return { ok:false, reason, details }.
//
// Callers MUST handle failure by falling back to pasted source.
//
// Exposed as window.AI_fetchListingUrl.

(function () {
  'use strict';

  const FETCH_TIMEOUT_MS = 15000;

  // Ordered, most-reliable-first. Any can break; all are best-effort.
  const PROXY_STRATEGIES = [
    {
      name: 'allorigins-raw',
      build: (url) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
      extract: async (res) => await res.text()
    },
    {
      name: 'allorigins-get',
      build: (url) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(url),
      extract: async (res) => {
        const data = await res.json();
        return (data && data.contents) ? data.contents : '';
      }
    },
    {
      name: 'codetabs',
      build: (url) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url),
      extract: async (res) => await res.text()
    },
    {
      name: 'thingproxy',
      build: (url) => 'https://thingproxy.freeboard.io/fetch/' + url,
      extract: async (res) => await res.text()
    },
    {
      name: 'corsproxy-io',
      build: (url) => 'https://corsproxy.io/?' + encodeURIComponent(url),
      extract: async (res) => await res.text()
    }
  ];

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
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'follow',
            headers: { 'Accept': 'text/html,*/*' }
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
          attempts.push(`${strategy.name}: non-HTML response`);
          continue;
        }

        return { ok: true, html: text, proxyUsed: strategy.name, attempts };
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
