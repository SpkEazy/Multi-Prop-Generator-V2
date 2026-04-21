// =====================
// LISTING EXTRACTOR
// =====================
// Parses either:
//   (A) full HTML source from an AuctionInc listing page, or
//   (B) plain pasted listing text (PDF copy, Word copy, visible page text).
//
// Deterministic. No AI. Returns a raw-fields object for the transformer.
// Exposed as window.AI_parseListingSource.
//
// Signals supported (from provided Fordsburg page + general AuctionInc pages):
//   - <title> tag                            → title / ref
//   - <meta name="description">              → description / marketing blurb
//   - "Property Description" section         → long description
//   - "PROPERTY ADDRESS"                     → property address (NOT written to form)
//   - "AUCTION ADDRESS"                      → auction address (used if form address is default)
//   - "AUCTION DATE"                         → date
//   - "AUCTION START TIME"                   → time
//   - "ERF SIZE"                             → erf
//   - "GLA" / "GBA"                          → gla
//   - Broker block (name, phone, email)      → broker inference

(function () {
  'use strict';

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
    // Remove script/style blocks first
    let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
    // Turn block elements into newlines so structure is preserved
    s = s.replace(/<\/(p|div|li|br|tr|h[1-6]|section)>/gi, '\n');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    // Strip remaining tags
    s = s.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    s = s.replace(/&nbsp;/gi, ' ')
         .replace(/&amp;/gi, '&')
         .replace(/&lt;/gi, '<')
         .replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"')
         .replace(/&#39;/gi, "'")
         .replace(/&rsquo;/gi, "'")
         .replace(/&lsquo;/gi, "'")
         .replace(/&rdquo;/gi, '"')
         .replace(/&ldquo;/gi, '"')
         .replace(/&mdash;/gi, '—')
         .replace(/&ndash;/gi, '–')
         .replace(/&hellip;/gi, '…')
         .replace(/&#8217;/gi, "'")
         .replace(/&#8216;/gi, "'")
         .replace(/&#8220;/gi, '"')
         .replace(/&#8221;/gi, '"')
         .replace(/&#177;/gi, '±')
         .replace(/&plusmn;/gi, '±')
         .replace(/&sup2;/gi, '²')
         .replace(/&#178;/gi, '²');
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

  function formatArea(raw) {
    if (!raw) return null;
    let v = String(raw).trim();
    v = v.replace(/[±~]/g, '').replace(/m[²2]/gi, '').trim();
    v = v.replace(/[^\d,\s\.]/g, '').trim();
    if (!v) return null;
    v = v.replace(/\s+/g, ' ');
    return `±${v}m²`;
  }

  function parseAreaNumber(raw) {
    if (!raw) return 0;
    const digits = String(raw).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  /**
   * From HTML: pull meta description + title + structured blocks.
   */
  function extractFromHtml(html) {
    const out = {
      pageTitle: null,
      metaDescription: null
    };

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      out.pageTitle = stripHtmlToText(titleMatch[1]).trim();
    }

    const metaMatch = html.match(
      /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
    ) || html.match(
      /<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i
    );
    if (metaMatch) {
      out.metaDescription = stripHtmlToText(metaMatch[1]).trim();
    }

    // OG description is sometimes fuller
    const ogDesc = html.match(
      /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );
    if (ogDesc && (!out.metaDescription || ogDesc[1].length > out.metaDescription.length)) {
      out.metaDescription = stripHtmlToText(ogDesc[1]).trim();
    }

    return out;
  }

  /**
   * Heuristic: extract the section of text following a labelled header.
   * Used for "PROPERTY ADDRESS", "AUCTION DATE", etc. on AuctionInc pages.
   */
  function extractLabelledValue(text, labels, maxLen) {
    const lines = text.split('\n');
    maxLen = maxLen || 200;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      const upper = raw.toUpperCase();
      for (const label of labels) {
        const labelUpper = label.toUpperCase();
        // Inline form: "LABEL: value"
        if (upper.startsWith(labelUpper + ':') || upper.startsWith(labelUpper + ' :')) {
          const value = raw.slice(raw.indexOf(':') + 1).trim();
          if (value && value.length < maxLen) return value;
        }
        // Label-as-heading form: value is on next non-empty line
        if (upper === labelUpper || upper === labelUpper + ':') {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const next = lines[j].trim();
            if (next && next.length < maxLen) return next;
          }
        }
      }
    }
    return null;
  }

  /**
   * Extract "Property Description" long-form block.
   */
  function extractDescription(text) {
    const idx = text.search(/property description/i);
    if (idx < 0) return null;
    // Take up to 4000 chars after the heading
    const slice = text.slice(idx, idx + 4000);
    // Drop the heading itself
    return slice.replace(/^\s*property description\s*:?\s*/i, '').trim();
  }

  /**
   * Broker inference from page source/text.
   * Reuses AI_inferBroker from brokers.js (email/phone/name matching).
   */
  function findBrokerId(text) {
    if (typeof window.AI_inferBroker === 'function') {
      return window.AI_inferBroker(text);
    }
    return null;
  }

  /**
   * MAIN ENTRY.
   * Accepts either HTML source or plain text. Returns unified raw-fields object.
   */
  function parseListingSource(input, sourceUrl) {
    const out = {
      sourceUrl: sourceUrl || null,
      pageTitle: null,
      metaDescription: null,

      title: null,              // short title derived from page
      suburb: null,
      city: null,
      province: null,

      propertyAddress: null,    // NOT written to form — reference only
      auctionAddress: null,     // NOT auto-written if user has non-default address

      auctionDate: null,        // ISO-ish date string if parseable
      auctionTime: null,        // HH:MM

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

    if (!input) return out;

    const isHtml = looksLikeHtml(input);
    let htmlMeta = { pageTitle: null, metaDescription: null };
    let text;

    if (isHtml) {
      htmlMeta = extractFromHtml(input);
      text = stripHtmlToText(input);
    } else {
      text = normaliseText(input);
    }

    out.pageTitle = htmlMeta.pageTitle;
    out.metaDescription = htmlMeta.metaDescription;
    out.rawText = text;

    // ---- TITLE ----
    // Prefer page title when available (cleaner on AuctionInc pages)
    if (out.pageTitle) {
      // AuctionInc titles look like: "Fordsburg - Fully Let Block of Flats - AuctionInc"
      let t = out.pageTitle;
      // Strip trailing " - AuctionInc" / " | AuctionInc" etc.
      t = t.replace(/\s*[|\-–]\s*auction\s*inc.*$/i, '').trim();
      out.title = t;
    }
    if (!out.title) {
      // Fallback: first non-empty line of text (PDF-style)
      const lines = text.split('\n').map(l => l.trim());
      const firstLine = lines.find(l => l.length > 0);
      if (firstLine) out.title = firstLine;
    }

    // ---- SUBURB / CITY ----
    // From title: "<Suburb> - <Descriptor>"
    if (out.title && out.title.includes(' - ')) {
      out.suburb = out.title.split(' - ')[0].trim();
    }

    // From "<Suburb> - Property Ref:" pattern (PDF-style)
    const suburbRef = firstMatch(text, /^(.+?)\s*-\s*Property Ref:/m);
    if (suburbRef) out.suburb = suburbRef;

    // City: line after "Property Ref:" OR from property address
    const lines = text.split('\n').map(l => l.trim());
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

    // ---- PROPERTY ADDRESS (NOT written to form) ----
    out.propertyAddress = extractLabelledValue(text, ['PROPERTY ADDRESS', 'Property Address'], 200);

    // ---- AUCTION ADDRESS (reference only) ----
    out.auctionAddress = extractLabelledValue(text, ['AUCTION ADDRESS', 'Auction Address'], 200);

    // If city not detected yet, try to pull from property address
    if (!out.city && out.propertyAddress) {
      const parts = out.propertyAddress.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // Common pattern: "<Street>, <Suburb>, <City>, <Province>"
        out.city = parts[parts.length - 2];
        if (!out.suburb) out.suburb = parts[parts.length - 3];
      } else if (parts.length === 2) {
        out.city = parts[1];
        if (!out.suburb) out.suburb = parts[0];
      }
    }

    // ---- AUCTION DATE / TIME ----
    const auctionDateRaw = extractLabelledValue(text, ['AUCTION DATE', 'Auction Date'], 60);
    if (auctionDateRaw) {
      // Accept formats like "2026-05-21", "21 May 2026", "21/05/2026"
      // Normalise to ISO yyyy-mm-dd where possible
      const iso = auctionDateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (iso) {
        out.auctionDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      } else {
        const dmy = auctionDateRaw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
        if (dmy) {
          const monthNames = ['january','february','march','april','may','june',
                              'july','august','september','october','november','december'];
          const mi = monthNames.indexOf(dmy[2].toLowerCase());
          if (mi >= 0) {
            const mm = String(mi + 1).padStart(2, '0');
            const dd = String(parseInt(dmy[1], 10)).padStart(2, '0');
            out.auctionDate = `${dmy[3]}-${mm}-${dd}`;
          }
        } else {
          const slash = auctionDateRaw.match(/(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/);
          if (slash) {
            const dd = String(parseInt(slash[1], 10)).padStart(2, '0');
            const mm = String(parseInt(slash[2], 10)).padStart(2, '0');
            out.auctionDate = `${slash[3]}-${mm}-${dd}`;
          }
        }
      }
    }

    const auctionTimeRaw = extractLabelledValue(text, ['AUCTION START TIME', 'AUCTION TIME', 'Auction Time'], 30);
    if (auctionTimeRaw) {
      const hm = auctionTimeRaw.match(/(\d{1,2}):(\d{2})/);
      if (hm) {
        const hh = String(parseInt(hm[1], 10)).padStart(2, '0');
        out.auctionTime = `${hh}:${hm[2]}`;
      }
    }

    // ---- FEATURES (PDF-style listings still use Feature 1/2/3) ----
    out.feat1 = firstMatch(text, /^Feature 1:\s*(.+)$/mi);
    out.feat2 = firstMatch(text, /^Feature 2:\s*(.+)$/mi);
    out.feat3 = firstMatch(text, /^Feature 3:\s*(.+)$/mi);

    // ---- ERF / GLA ----
    // Accept "ERF SIZE", "ERF Size (m2)", "ERF: 496m²" variants
    const erfRaw =
      firstMatch(text, /ERF\s*SIZE\s*[:\-]?\s*([\d\s,\.±~]+\s*m[²2]?)/i) ||
      firstMatch(text, /ERF\s*Size\s*\(m2\)\s*([\d\s,\.]+)/i) ||
      firstMatch(text, /\bERF\s*[:\-]\s*([\d\s,\.±~]+\s*m[²2]?)/i);
    if (erfRaw) {
      out.erfNumber = parseAreaNumber(erfRaw);
      if (out.erfNumber > 0) out.erf = formatArea(erfRaw);
    }

    const glaRaw =
      firstMatch(text, /\b(?:GLA|GBA)\s*[:\-]?\s*([\d\s,\.±~]+\s*m[²2]?)/i) ||
      firstMatch(text, /(?:GLA|GBA)\s*\(m2\)\s*([\d\s,\.]+)/i);
    if (glaRaw) {
      out.glaNumber = parseAreaNumber(glaRaw);
      if (out.glaNumber >= 500) {
        out.gla = formatArea(glaRaw);
      }
    }

    // ---- DESCRIPTION ----
    out.description = extractDescription(text) || out.metaDescription || text.slice(0, 3000);

    // ---- BROKER ----
    out.brokerId = findBrokerId(text);

    return out;
  }

  window.AI_parseListingSource = parseListingSource;
  // Back-compat alias for Stage 1 code paths
  window.AI_parseListingText = function (text) {
    return parseListingSource(text, null);
  };
})();
