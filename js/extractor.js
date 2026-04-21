// =====================
// LISTING TEXT EXTRACTOR
// =====================
// Deterministic parser for pasted AuctionInc-style listing text.
// Returns a raw-fields object — no AI, no LLM.
// Exposed as window.AI_parseListingText.

(function () {
  'use strict';

  /**
   * Clean and normalise input text.
   */
  function normaliseText(text) {
    if (!text) return '';
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00A0/g, ' ')     // non-breaking space → space
      .replace(/[ \t]+/g, ' ')     // collapse runs of spaces/tabs
      .replace(/\n{3,}/g, '\n\n'); // collapse excessive blank lines
  }

  /**
   * Extract first regex capture group, trimmed. Returns null if no match.
   */
  function firstMatch(text, re) {
    const m = text.match(re);
    return m && m[1] ? m[1].trim() : null;
  }

  /**
   * Format a numeric m² value with ± prefix and m² suffix.
   * Accepts "7 497", "7,497", "±2,962", "2962" etc.
   */
  function formatArea(raw) {
    if (!raw) return null;
    let v = String(raw).trim();
    // strip existing m², m2, ±
    v = v.replace(/[±~]/g, '').replace(/m[²2]/gi, '').trim();
    // keep digits + space + comma + .
    v = v.replace(/[^\d,\s\.]/g, '').trim();
    if (!v) return null;
    // collapse multiple spaces
    v = v.replace(/\s+/g, ' ');
    return `±${v}m²`;
  }

  /**
   * Parse raw numeric value (for threshold checks) — returns integer or 0.
   */
  function parseAreaNumber(raw) {
    if (!raw) return 0;
    const digits = String(raw).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  /**
   * Main parser. Accepts pasted text, returns raw fields object.
   */
  function parseListingText(input) {
    const text = normaliseText(input);
    const result = {
      title: null,
      suburb: null,
      city: null,
      province: null,
      address: null,       // EXTRACTED BUT NEVER APPLIED TO FORM (address behavior preserved)
      feat1: null,
      feat2: null,
      feat3: null,
      erf: null,           // formatted as ±Xm²
      gla: null,           // formatted as ±Xm²
      erfNumber: 0,        // raw int for threshold logic
      glaNumber: 0,        // raw int for threshold logic
      description: null,
      rawText: text
    };
    if (!text) return result;

    const lines = text.split('\n').map(l => l.trim());

    // --- TITLE: first non-empty line ---
    const firstLine = lines.find(l => l.length > 0);
    if (firstLine) result.title = firstLine;

    // --- SUBURB: match "<Suburb> - Property Ref:" (present in all examples) ---
    const suburbMatch = firstMatch(text, /^(.+?)\s*-\s*Property Ref:/m);
    if (suburbMatch) {
      result.suburb = suburbMatch;
    } else {
      // Fallback: first segment before " - " in title
      if (result.title && result.title.includes(' - ')) {
        result.suburb = result.title.split(' - ')[0].trim();
      }
    }

    // --- CITY: line after "Property Ref:" line ---
    const refIdx = lines.findIndex(l => /Property Ref:/i.test(l));
    if (refIdx >= 0) {
      for (let i = refIdx + 1; i < Math.min(refIdx + 4, lines.length); i++) {
        const l = lines[i];
        if (!l) continue;
        if (/^Province:/i.test(l)) continue;
        if (/^Feature \d:/i.test(l)) break;
        result.city = l;
        break;
      }
    }

    // --- PROVINCE ---
    const prov = firstMatch(text, /^Province:\s*(.+)$/mi);
    if (prov) result.province = prov;

    // --- ADDRESS (extracted for reference only — NOT written to form) ---
    // Address is typically the second non-empty line before "<Suburb> - Property Ref:"
    if (result.title) {
      const titleIdx = lines.findIndex(l => l === result.title);
      if (titleIdx >= 0) {
        for (let i = titleIdx + 1; i < Math.min(titleIdx + 5, lines.length); i++) {
          const l = lines[i];
          if (!l) continue;
          if (/Property Ref:/i.test(l)) break;
          // Looks like an address if it contains a number and a street-ish word
          if (/\d/.test(l) && /[a-zA-Z]{3,}/.test(l) && l.length < 120) {
            result.address = l;
            break;
          }
        }
      }
    }

    // --- FEATURES ---
    result.feat1 = firstMatch(text, /^Feature 1:\s*(.+)$/mi);
    result.feat2 = firstMatch(text, /^Feature 2:\s*(.+)$/mi);
    result.feat3 = firstMatch(text, /^Feature 3:\s*(.+)$/mi);

    // --- ERF SIZE ---
    const erfRaw = firstMatch(text, /ERF Size\s*\(m2\)\s*([\d\s,\.]+)/i);
    if (erfRaw) {
      result.erfNumber = parseAreaNumber(erfRaw);
      if (result.erfNumber > 0) result.erf = formatArea(erfRaw);
    }

    // --- GLA / GBA ---
    const glaRaw = firstMatch(text, /(?:GLA|GBA)\s*\(m2\)\s*([\d\s,\.]+)/i);
    if (glaRaw) {
      result.glaNumber = parseAreaNumber(glaRaw);
      // Only keep GLA if material (>500m²). Small GBA values are typically just offices.
      if (result.glaNumber >= 500) {
        result.gla = formatArea(glaRaw);
      }
    }

    // --- DESCRIPTION (for tag/headline inference) ---
    const descIdx = text.search(/Property Description/i);
    if (descIdx >= 0) {
      result.description = text.slice(descIdx, descIdx + 3000);
    } else {
      // Fallback: use full text for keyword inference
      result.description = text;
    }

    return result;
  }

  window.AI_parseListingText = parseListingText;
})();
