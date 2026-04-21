// =====================
// LISTING EXTRACTOR
// =====================
// Two paths:
//   (A) HTML from a real AuctionInc listing page   → DOM-aware parse (DOMParser)
//   (B) Plain pasted text / PDF copy               → legacy label/regex parse
//
// Returns a raw-fields object for the transformer.
// Exposed as window.AI_parseListingSource.

(function () {
  'use strict';

  // ---------- helpers ----------
  function normaliseText(text) {
    if (!text) return '';
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  }

  function firstMatch(text, re) {
    const m = text.match(re);
    return m && m[1] ? m[1].trim() : null;
  }

  function stripHtmlToText(html) {
    if (!html) return '';
    let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    s = s.replace(/<\/(p|div|li|br|tr|h[1-6]|section)>/gi, '\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/&nbsp;/gi, ' ')
         .replace(/&amp;/gi, '&')
         .replace(/&lt;/gi, '<')
         .replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"')
         .replace(/&#39;/gi, "'")
         .replace(/&rsquo;|&#8217;/gi, "'")
         .replace(/&lsquo;|&#8216;/gi, "'")
         .replace(/&rdquo;|&#8221;/gi, '"')
         .replace(/&ldquo;|&#8220;/gi, '"')
         .replace(/&mdash;/gi, '—')
         .replace(/&ndash;/gi, '–')
         .replace(/&hellip;/gi, '…')
         .replace(/&#177;|&plusmn;/gi, '±')
         .replace(/&sup2;|&#178;/gi, '²');
    return normaliseText(s);
  }

  function looksLikeHtml(src) {
    if (!src) return false;
    const lower = src.toLowerCase();
    return lower.indexOf('<html') !== -1 ||
           lower.indexOf('<!doctype') !== -1 ||
           lower.indexOf('<body') !== -1 ||
           lower.indexOf('<meta') !== -1 ||
           (lower.indexOf('<div') !== -1 && lower.indexOf('</div>') !== -1);
  }

  function parseAreaNumber(raw) {
    if (!raw) return 0;
    const digits = String(raw).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  // Format an area value. Detects ha / hectares and converts to Ha label.
  function formatArea(raw) {
    if (!raw) return null;
    const original = String(raw);
    const isHa = /\b(ha|hectare)/i.test(original);

    // Extract the leading numeric (with possible decimal / comma)
    const m = original.match(/([\d]+(?:[.,]\d+)?)/);
    if (!m) return null;
    const numStr = m[1];

    if (isHa) {
      return `±${numStr}Ha`;
    }

    // Format square metre, with space thousands for readability
    const n = parseInt(numStr.replace(/[^\d]/g, ''), 10);
    if (!n) return null;
    // Large values: if over ~20000 and source didn't say m² explicitly, keep m²
    const pretty = n.toLocaleString('en-ZA').replace(/,/g, ' ');
    return `±${pretty}m²`;
  }

  function extractLabelledValue(text, labels, maxLen) {
    const lines = text.split('\n');
    maxLen = maxLen || 200;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const upper = raw.toUpperCase();
      for (const label of labels) {
        const lu = label.toUpperCase();
        if (upper.startsWith(lu + ':') || upper.startsWith(lu + ' :')) {
          const value = raw.slice(raw.indexOf(':') + 1).trim();
          if (value && value.length < maxLen) return value;
        }
        if (upper === lu || upper === lu + ':') {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const next = lines[j].trim();
            if (next && next.length < maxLen) return next;
          }
        }
      }
    }
    return null;
  }

  function extractDescriptionFromText(text) {
    const idx = text.search(/property description/i);
    if (idx < 0) return null;
    const slice = text.slice(idx, idx + 4000);
    return slice.replace(/^\s*property description\s*:?\s*/i, '').trim();
  }

  function findBrokerId(text) {
    if (typeof window.AI_inferBroker === 'function') {
      return window.AI_inferBroker(text);
    }
    return null;
  }

  // ---------- DOM-aware parse for live AuctionInc HTML ----------
  function parseWithDom(html, sourceUrl) {
    const out = makeEmpty(sourceUrl);

    let doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      return null;
    }
    if (!doc || !doc.body) return null;

    // ---- Title + meta ----
    const titleEl = doc.querySelector('title');
    if (titleEl) out.pageTitle = titleEl.textContent.trim();

    const metaDesc = doc.querySelector('meta[name="description"]');
    if (metaDesc) out.metaDescription = (metaDesc.getAttribute('content') || '').trim();

    const ogDesc = doc.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      const c = (ogDesc.getAttribute('content') || '').trim();
      if (c && (!out.metaDescription || c.length > out.metaDescription.length)) {
        out.metaDescription = c;
      }
    }

    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle && !out.pageTitle) {
      out.pageTitle = (ogTitle.getAttribute('content') || '').trim();
    }

    // ---- H1 is usually the strongest title ----
    const h1 = doc.querySelector('h1');
    if (h1) {
      const h1t = h1.textContent.replace(/\s+/g, ' ').trim();
      if (h1t) out.title = h1t;
    }
    if (!out.title && out.pageTitle) {
      out.title = out.pageTitle
        .replace(/\s*[|\-–]\s*auction\s*inc.*$/i, '')
        .trim();
    }

    // ---- Suburb from URL slug (e.g. /auctions/vaal-sasolburg-architectural-masterpiece/9211/) ----
    // and from title splitting
    if (sourceUrl) {
      try {
        const u = new URL(sourceUrl);
        const parts = u.pathname.split('/').filter(Boolean);
        const slugIdx = parts.indexOf('auctions');
        if (slugIdx >= 0 && parts[slugIdx + 1]) {
          const slug = parts[slugIdx + 1];
          const slugWords = slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1));
          out._urlSlugWords = slugWords;
        }
      } catch (e) { /* ignore */ }
    }

    // ---- Key/value "auction details" blocks ----
    // AuctionInc listings render labelled rows. We scan common patterns:
    // dl/dt/dd, table rows, and <li><strong>Label:</strong> value</li>.
    const kv = collectKeyValuePairs(doc);

    // Property Address — NEVER used to overwrite form address, but kept for reference
    out.propertyAddress = kv['property address'] || null;
    out.auctionAddress  = kv['auction address'] || kv['auction venue'] || null;

    // ERF / GLA
    const erfRaw =
      kv['erf size'] || kv['erf'] ||
      kv['stand size'] || kv['land size'] || kv['property size'];
    if (erfRaw) {
      out.erfNumber = parseAreaNumber(erfRaw);
      out.erf = formatArea(erfRaw);
    }

    const glaRaw =
      kv['gla'] || kv['gba'] ||
      kv['gross lettable area'] || kv['gross building area'] ||
      kv['total gla'] || kv['total gba'];
    if (glaRaw) {
      const n = parseAreaNumber(glaRaw);
      if (n > 0) {
        out.glaNumber = n;
        // Only emit GLA when it's meaningful (> 50m²) — avoids junk "3m²" from page text
        if (n >= 50) out.gla = formatArea(glaRaw);
      }
    }

    // Date & time
    const dateRaw = kv['auction date'] || kv['date'] || null;
    if (dateRaw) out.auctionDate = normaliseDateString(dateRaw);

    const timeRaw = kv['auction start time'] || kv['auction time'] || kv['start time'] || kv['time'] || null;
    if (timeRaw) out.auctionTime = normaliseTimeString(timeRaw);

    // City / suburb from property address if we got one
    if (out.propertyAddress) {
      const parts = out.propertyAddress.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        out.city = parts[parts.length - 2];
        out.suburb = parts[parts.length - 3];
      } else if (parts.length === 2) {
        out.city = parts[1];
        out.suburb = parts[0];
      } else if (parts.length === 1) {
        out.suburb = parts[0];
      }
    }

    // Suburb/city fallback from URL slug
    if ((!out.suburb || !out.city) && out._urlSlugWords && out._urlSlugWords.length >= 2) {
      // Common pattern: <City>-<Suburb>-<descriptor...>
      if (!out.city) out.city = out._urlSlugWords[0];
      if (!out.suburb) out.suburb = out._urlSlugWords[1];
    }

    // Suburb fallback from title ("<Suburb> - Descriptor")
    if (!out.suburb && out.title && out.title.includes(' - ')) {
      out.suburb = out.title.split(' - ')[0].trim();
    }

    // ---- Description (property description block) ----
    const descCandidates = [
      '.property-description',
      '.auction-description',
      '#property-description',
      '#description',
      '.listing-description',
      '.entry-content',
      '.single-auction__description',
      'article .description'
    ];
    let descText = '';
    for (const sel of descCandidates) {
      const el = doc.querySelector(sel);
      if (el) {
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (t && t.length > descText.length) descText = t;
      }
    }
    if (!descText) {
      // Last resort: gather paragraphs in the main content
      const main = doc.querySelector('main, article, .content, #content') || doc.body;
      const ps = Array.from(main.querySelectorAll('p'))
        .map(p => p.textContent.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 40);
      if (ps.length) descText = ps.join(' ');
    }
    out.description = descText || out.metaDescription || '';

    // ---- Features: try bullet lists inside/near description ----
    const featureBullets = extractBulletFeatures(doc);
    if (featureBullets.length) {
      out.feat1 = featureBullets[0] || null;
      out.feat2 = featureBullets[1] || null;
      out.feat3 = featureBullets[2] || null;
    }

    // ---- Broker inference (scan whole body text) ----
    const bodyText = doc.body.textContent || '';
    out.brokerId = findBrokerId(bodyText);

    // Raw text for transformer fallbacks
    out.rawText = stripHtmlToText(html);

    return out;
  }

  function collectKeyValuePairs(doc) {
    const kv = {};

    // dt/dd pairs
    doc.querySelectorAll('dl').forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      dts.forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd && dd.tagName.toLowerCase() === 'dd') {
          const k = dt.textContent.replace(/:\s*$/,'').trim().toLowerCase();
          const v = dd.textContent.replace(/\s+/g,' ').trim();
          if (k && v) kv[k] = v;
        }
      });
    });

    // table rows with 2 cells
    doc.querySelectorAll('tr').forEach(tr => {
      const cells = tr.querySelectorAll('th,td');
      if (cells.length === 2) {
        const k = cells[0].textContent.replace(/:\s*$/,'').trim().toLowerCase();
        const v = cells[1].textContent.replace(/\s+/g,' ').trim();
        if (k && v && !kv[k]) kv[k] = v;
      }
    });

    // <li><strong>Label:</strong> value</li>  or  <li>Label: value</li>
    doc.querySelectorAll('li, p, div').forEach(el => {
      // only "small" elements — skip huge containers
      const t = el.textContent.replace(/\s+/g,' ').trim();
      if (!t || t.length > 200) return;
      const m = t.match(/^([A-Za-z][A-Za-z \/]+?)\s*:\s*(.+)$/);
      if (m) {
        const k = m[1].trim().toLowerCase();
        const v = m[2].trim();
        if (k.length < 40 && v && !kv[k]) kv[k] = v;
      }
    });

    return kv;
  }

  function extractBulletFeatures(doc) {
    const selectors = [
      '.property-description ul li',
      '.auction-description ul li',
      '.listing-description ul li',
      '.entry-content ul li',
      '.single-auction__description ul li',
      'article ul li'
    ];
    for (const sel of selectors) {
      const lis = Array.from(doc.querySelectorAll(sel))
        .map(li => li.textContent.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 4 && t.length < 160);
      if (lis.length >= 2) return lis.slice(0, 6);
    }
    return [];
  }

  function normaliseDateString(s) {
    if (!s) return null;
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const months = ['january','february','march','april','may','june',
                    'july','august','september','october','november','december'];

    const dmy = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (dmy) {
      const mi = months.indexOf(dmy[2].toLowerCase());
      if (mi >= 0) {
        return `${dmy[3]}-${String(mi+1).padStart(2,'0')}-${String(parseInt(dmy[1],10)).padStart(2,'0')}`;
      }
    }

    // "Tuesday, 24 February 2026"
    const dmyLong = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+of?\s*([A-Za-z]+)\s+(\d{4})/);
    if (dmyLong) {
      const mi = months.indexOf(dmyLong[2].toLowerCase());
      if (mi >= 0) {
        return `${dmyLong[3]}-${String(mi+1).padStart(2,'0')}-${String(parseInt(dmyLong[1],10)).padStart(2,'0')}`;
      }
    }

    const slash = s.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
    if (slash) {
      return `${slash[3]}-${String(parseInt(slash[2],10)).padStart(2,'0')}-${String(parseInt(slash[1],10)).padStart(2,'0')}`;
    }
    return null;
  }

  function normaliseTimeString(s) {
    if (!s) return null;
    const hm = s.match(/(\d{1,2}):(\d{2})/);
    if (hm) {
      return `${String(parseInt(hm[1],10)).padStart(2,'0')}:${hm[2]}`;
    }
    const ampm = s.match(/(\d{1,2})\s*(am|pm)/i);
    if (ampm) {
      let h = parseInt(ampm[1],10);
      if (ampm[2].toLowerCase() === 'pm' && h < 12) h += 12;
      if (ampm[2].toLowerCase() === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2,'0')}:00`;
    }
    return null;
  }

  function makeEmpty(sourceUrl) {
    return {
      sourceUrl: sourceUrl || null,
      pageTitle: null,
      metaDescription: null,
      title: null,
      suburb: null,
      city: null,
      province: null,
      propertyAddress: null,
      auctionAddress: null,
      auctionDate: null,
      auctionTime: null,
      feat1: null,
      feat2: null,
      feat3: null,
      erf: null,
      gla: null,
      erfNumber: 0,
      glaNumber: 0,
      description: null,
      rawText: null,
      brokerId: null
    };
  }

  // ---------- Legacy text/PDF-style parse (kept as fallback) ----------
  function parseWithText(input, sourceUrl) {
    const out = makeEmpty(sourceUrl);
    const isHtml = looksLikeHtml(input);
    const text = isHtml ? stripHtmlToText(input) : normaliseText(input);
    out.rawText = text;

    // Title: first non-empty line
    const lines = text.split('\n').map(l => l.trim());
    const firstLine = lines.find(l => l.length > 0);
    if (firstLine) out.title = firstLine;

    if (out.title && out.title.includes(' - ')) {
      out.suburb = out.title.split(' - ')[0].trim();
    }

    const suburbRef = firstMatch(text, /^(.+?)\s*-\s*Property Ref:/m);
    if (suburbRef) out.suburb = suburbRef;

    const refIdx = lines.findIndex(l => /Property Ref:/i.test(l));
    if (refIdx >= 0) {
      for (let i = refIdx + 1; i < Math.min(refIdx + 4, lines.length); i++) {
        const l = lines[i];
        if (!l) continue;
        if (/^Province:/i.test(l)) continue;
        if (/^Feature \d:/i.test(l)) break;
        out.city = l;
        break;
      }
    }

    const prov = firstMatch(text, /^Province:\s*(.+)$/mi);
    if (prov) out.province = prov;

    out.propertyAddress = extractLabelledValue(text, ['PROPERTY ADDRESS','Property Address'], 200);
    out.auctionAddress  = extractLabelledValue(text, ['AUCTION ADDRESS','Auction Address'], 200);

    const auctionDateRaw = extractLabelledValue(text, ['AUCTION DATE','Auction Date'], 60);
    if (auctionDateRaw) out.auctionDate = normaliseDateString(auctionDateRaw);

    const auctionTimeRaw = extractLabelledValue(text, ['AUCTION START TIME','AUCTION TIME','Auction Time'], 30);
    if (auctionTimeRaw) out.auctionTime = normaliseTimeString(auctionTimeRaw);

    out.feat1 = firstMatch(text, /^Feature 1:\s*(.+)$/mi);
    out.feat2 = firstMatch(text, /^Feature 2:\s*(.+)$/mi);
    out.feat3 = firstMatch(text, /^Feature 3:\s*(.+)$/mi);

    const erfRaw =
      firstMatch(text, /ERF\s*SIZE\s*[:\-]?\s*([\d\s,\.±~]+\s*(?:m[²2]|ha|hectares?))/i) ||
      firstMatch(text, /ERF\s*Size\s*\(m2\)\s*([\d\s,\.]+)/i) ||
      firstMatch(text, /\bERF\s*[:\-]\s*([\d\s,\.±~]+\s*(?:m[²2]|ha|hectares?))/i);
    if (erfRaw) {
      out.erfNumber = parseAreaNumber(erfRaw);
      if (out.erfNumber > 0) out.erf = formatArea(erfRaw);
    }

    const glaRaw =
      firstMatch(text, /\b(?:GLA|GBA)\s*[:\-]?\s*([\d\s,\.±~]+\s*m[²2]?)/i) ||
      firstMatch(text, /(?:GLA|GBA)\s*\(m2\)\s*([\d\s,\.]+)/i);
    if (glaRaw) {
      out.glaNumber = parseAreaNumber(glaRaw);
      if (out.glaNumber >= 50) out.gla = formatArea(glaRaw);
    }

    out.description = extractDescriptionFromText(text) || text.slice(0, 3000);
    out.brokerId = findBrokerId(text);

    return out;
  }

  // ---------- MAIN ENTRY ----------
  function parseListingSource(input, sourceUrlOrOpts) {
    if (!input) return makeEmpty(null);

    // Accept either a string URL or an {sourceUrl} opts object
    let sourceUrl = null;
    if (typeof sourceUrlOrOpts === 'string') {
      sourceUrl = sourceUrlOrOpts;
    } else if (sourceUrlOrOpts && typeof sourceUrlOrOpts === 'object') {
      sourceUrl = sourceUrlOrOpts.sourceUrl || null;
    }

    if (looksLikeHtml(input)) {
      const domResult = parseWithDom(input, sourceUrl);
      if (domResult) return domResult;
    }

    return parseWithText(input, sourceUrl);
  }

  window.AI_parseListingSource = parseListingSource;
  window.AI_parseListingText = function (text) {
    return parseListingSource(text, null);
  };
})();
