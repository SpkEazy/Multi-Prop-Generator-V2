// =====================
// LISTING → CANONICAL SUMMARY TRANSFORMER
// =====================
// Deterministic rule-based transformation.
// Takes the raw output from extractor.js and produces the canonical
// AuctionInc Word Summary structure:
//   Broker, Headline, City, Suburb, Tagline 1, Tagline 2,
//   Date & Time, Feature 1-3, GLA (optional), ERF Size (optional)
//
// Exposed as window.AI_transformToSummary.

(function () {
  'use strict';

  // -----------------------------------------
  // TAG RULES (reverse-engineered from examples)
  // First match wins. Order matters.
  // -----------------------------------------
  const TAG_RULES = [
    { re: /liquidation/i,                                              t1: 'LIQUIDATION',   t2: 'SALE'        },
    { re: /deceased estate/i,                                          t1: 'DECEASED',      t2: 'ESTATE'      },
    { re: /double[-\s]?volume|overhead crane|high[-\s]?bay/i,          t1: 'DOUBLE',        t2: 'VOLUME'      },
    { re: /fuel depot|bulk storage|million litre|storage capacity/i,   t1: 'STRATEGIC',     t2: 'LOCATION'    },
    { re: /nsfas|student accom|student housing|occupancy rate/i,       t1: 'HIGH',          t2: 'YIELD'       },
    { re: /corner|redevelopment|double[-\s]?plot/i,                    t1: 'REDEVELOPMENT', t2: 'OPPORTUNITY' },
    { re: /signage|high[-\s]?visibility|arterial|exposure/i,           t1: 'SIGNAGE',       t2: 'OPPORTUNITY' },
    { re: /gated estate|woodhill|sought[-\s]?after/i,                  t1: 'SOUGHT-AFTER',  t2: 'ESTATE'      },
    { re: /near uj|university of johannesburg|milpark/i,               t1: 'NEAR',          t2: 'UJ'          },
    { re: /near tut|tshwane university/i,                              t1: 'NEAR',          t2: 'TUT'         },
    { re: /near wits/i,                                                t1: 'NEAR',          t2: 'WITS'        },
    { re: /development opportunity|development potential|zoning|re[-\s]?zoned/i, t1: 'DEVELOPMENT', t2: 'POTENTIAL' },
    { re: /investment|income[-\s]?producing|fully let|yield/i,         t1: 'INVESTMENT',    t2: 'OPPORTUNITY' },
    { re: /office park|office campus/i,                                t1: 'PRIME',         t2: 'OFFICES'     },
    { re: /warehouse|industrial/i,                                     t1: 'PRIME',         t2: 'INDUSTRIAL'  }
  ];

  function deriveTags(raw) {
    const haystack = [
      raw.title, raw.feat1, raw.feat2, raw.feat3, raw.description
    ].filter(Boolean).join(' ');

    for (const rule of TAG_RULES) {
      if (rule.re.test(haystack)) {
        return { tag1: rule.t1, tag2: rule.t2 };
      }
    }
    return { tag1: 'PRIME', tag2: 'LOCATION' };
  }

  // -----------------------------------------
  // HEADLINE DERIVATION
  // -----------------------------------------
  function deriveHeadline(raw) {
    const title = raw.title || '';
    // Strip suburb prefix if present: "Suburb - Descriptor"
    let desc = title.includes(' - ')
      ? title.split(' - ').slice(1).join(' - ').trim()
      : title;

    const haystack = `${title} ${raw.feat1 || ''} ${raw.feat2 || ''} ${raw.feat3 || ''} ${raw.description || ''}`;

    // --- STUDENT ACCOMMODATION ---
    if (/nsfas|student accom|student housing|bed facility/i.test(haystack)) {
      const beds = haystack.match(/(\d{2,4})[\s-]*bed/i);
      if (beds) return `${beds[1]}-BED STUDENT ACCOM.`;
      return 'STUDENT ACCOMMODATION';
    }

    // --- FUEL DEPOT ---
    if (/fuel depot|million litre|storage capacity/i.test(haystack)) {
      const mil = haystack.match(/(\d+(?:\.\d+)?)\s*million\s*litre/i);
      if (mil) return `±${mil[1]} MILLION LITRE FUEL DEPOT`;
      return 'FUEL DEPOT';
    }

    // --- INDUSTRIAL FACILITY ---
    if (/industrial.*facility|heavy[-\s]?duty|industrial\s*1/i.test(haystack)) {
      const sz = raw.gla || raw.erf;
      if (sz) return `${sz} INDUSTRIAL FACILITY`;
      return 'INDUSTRIAL FACILITY';
    }

    // --- OFFICE PARK / CAMPUS ---
    if (/office park|office campus/i.test(haystack)) {
      if (/highway|freeway|n1|n3|n12/i.test(haystack)) {
        return 'HIGHWAY EXPOSURE OFFICE PARK';
      }
      return 'PRIME OFFICE PARK';
    }

    // --- CORNER / REDEVELOPMENT SITE ---
    if (/corner.*(site|property|redevelopment)|double[-\s]?plot/i.test(haystack)) {
      return 'STRATEGIC CORNER SITE';
    }

    // --- DEVELOPMENT OPPORTUNITY ---
    if (/development opportunity/i.test(haystack)) {
      if (/residential/i.test(haystack) && raw.erf) {
        return `${raw.erf} RESIDENTIAL DEVELOPMENT`;
      }
      if (raw.erf) return `${raw.erf} DEVELOPMENT OPPORTUNITY`;
      return 'DEVELOPMENT OPPORTUNITY';
    }

    // --- FAMILY HOME ---
    if (/family home|bedroom.*home|bed.*spacious/i.test(haystack)) {
      const br = haystack.match(/(\d+)[\s-]*bed(?:room)?/i);
      if (br) return `${br[1]}-BEDROOM FAMILY HOME`;
      return 'FAMILY HOME';
    }

    // --- COMMERCIAL / SHOWROOM ---
    if (/commercial|showroom|versatile/i.test(haystack)) {
      return 'HIGH-EXPOSURE COMMERCIAL PROPERTY';
    }

    // --- FALLBACK ---
    return desc.replace(/[-|–].*$/, '').toUpperCase().trim().slice(0, 40) || 'PROPERTY';
  }

  // -----------------------------------------
  // HEADLINE SPLIT (for flyer subheadline/subheadline2)
  // -----------------------------------------
  function splitHeadline(headline) {
    if (!headline) return { sub1: '', sub2: '' };

    // Prefer splitting at explicit "|" separator
    if (headline.includes('|')) {
      const parts = headline.split('|').map(s => s.trim());
      return { sub1: parts[0], sub2: parts.slice(1).join(' | ') };
    }

    const words = headline.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { sub1: headline, sub2: '' };
    if (words.length === 2) return { sub1: words[0], sub2: words[1] };

    // For 3+ words: last 1-2 words go to line 2
    // Preference: last word on its own if long, else last 2 words
    const lastWord = words[words.length - 1];
    if (lastWord.length >= 7 && words.length >= 3) {
      return {
        sub1: words.slice(0, -1).join(' '),
        sub2: lastWord
      };
    }
    const cut = Math.ceil(words.length / 2);
    return {
      sub1: words.slice(0, cut).join(' '),
      sub2: words.slice(cut).join(' ')
    };
  }

  // -----------------------------------------
  // FEATURE POLISHING
  // Applies AuctionInc formatting conventions from examples:
  //   - "and" → "&"
  //   - "approximately" / "approx." → "±"
  //   - normalise | separators with spaces
  //   - collapse whitespace
  // Does NOT uppercase (templates do that via CSS).
  // -----------------------------------------
  function polishFeature(str) {
    if (!str) return '';
    let s = String(str);

    // Normalise whitespace
    s = s.replace(/\s+/g, ' ').trim();

    // "approximately" → "±"
    s = s.replace(/\bapproximately\s+/gi, '±');
    s = s.replace(/\bapprox\.?\s+/gi, '±');

    // Normalise ± spacing (no space between ± and number)
    s = s.replace(/±\s+/g, '±');

    // Replace " and " (as word) with " & "
    s = s.replace(/\s+and\s+/g, ' & ');

    // Normalise pipe separators: "| " and " |" → " | "
    s = s.replace(/\s*\|\s*/g, ' | ');

    // Collapse spaces again
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  }

  // -----------------------------------------
  // SUBURB CLEANUP
  // Some listings have "Bardene" (clean), others "Jansen Park" (2 words).
  // Preserve as-is but trim and title-case sensibly.
  // -----------------------------------------
  function cleanSuburb(s) {
    if (!s) return '';
    return s.replace(/\s+/g, ' ').trim();
  }

  function cleanCity(s) {
    if (!s) return '';
    return s.replace(/\s+/g, ' ').trim();
  }

  // -----------------------------------------
  // MAIN TRANSFORMER
  // -----------------------------------------
  function transformToSummary(raw) {
    if (!raw) return null;

    const headline = deriveHeadline(raw);
    const { sub1, sub2 } = splitHeadline(headline);
    const { tag1, tag2 } = deriveTags(raw);

    return {
      headline: headline,
      subheadline: sub1,
      subheadline2: sub2,
      city: cleanCity(raw.city),
      suburb: cleanSuburb(raw.suburb),
      tag1: tag1,
      tag2: tag2,
      feat1: polishFeature(raw.feat1),
      feat2: polishFeature(raw.feat2),
      feat3: polishFeature(raw.feat3),
      erf: raw.erf || '',
      gla: raw.gla || ''
      // address intentionally not included — preserved by form
    };
  }

  window.AI_transformToSummary = transformToSummary;
})();
