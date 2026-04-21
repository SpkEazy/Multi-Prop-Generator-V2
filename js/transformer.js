// =====================
// LISTING → CANONICAL SUMMARY TRANSFORMER
// =====================
// Produces AuctionInc-style ad copy from extracted facts.
// Rewrites — does NOT copy — the website's raw description.
//
// Canonical output structure (aligned with Word Summary):
//   headline, subheadline, subheadline2,
//   city, suburb,
//   tag1, tag2,
//   feat1, feat2, feat3,
//   erf, gla
//
// Exposed as window.AI_transformToSummary.

(function () {
  'use strict';

  // ---------------------------------------------------------
  // TAG RULES — first match wins, order matters
  // ---------------------------------------------------------
  const TAG_RULES = [
    { re: /fully let|tenanted|currently let|income[-\s]?producing/i,    t1: 'FULLY',         t2: 'LET'         },
    { re: /liquidation/i,                                               t1: 'LIQUIDATION',   t2: 'SALE'        },
    { re: /deceased estate/i,                                           t1: 'DECEASED',      t2: 'ESTATE'      },
    { re: /double[-\s]?volume|overhead crane|high[-\s]?bay/i,           t1: 'DOUBLE',        t2: 'VOLUME'      },
    { re: /fuel depot|bulk storage|million litre|storage capacity/i,    t1: 'STRATEGIC',     t2: 'LOCATION'    },
    { re: /nsfas|student accom|student housing|occupancy rate/i,        t1: 'HIGH',          t2: 'YIELD'       },
    { re: /corner|redevelopment|double[-\s]?plot/i,                     t1: 'REDEVELOPMENT', t2: 'OPPORTUNITY' },
    { re: /block of flats|residential block|multi[-\s]?unit/i,          t1: 'RESIDENTIAL',   t2: 'INCOME'      },
    { re: /signage|high[-\s]?visibility|arterial|exposure/i,            t1: 'SIGNAGE',       t2: 'OPPORTUNITY' },
    { re: /gated estate|estate living|sought[-\s]?after/i,              t1: 'SOUGHT-AFTER',  t2: 'ESTATE'      },
    { re: /near uj|university of johannesburg|milpark/i,                t1: 'NEAR',          t2: 'UJ'          },
    { re: /near tut|tshwane university/i,                               t1: 'NEAR',          t2: 'TUT'         },
    { re: /near wits/i,                                                 t1: 'NEAR',          t2: 'WITS'        },
    { re: /development opportunity|development potential|re[-\s]?zoned/i, t1: 'DEVELOPMENT', t2: 'POTENTIAL'   },
    { re: /approved (plans|building plans)|shovel[-\s]?ready/i,         t1: 'APPROVED',      t2: 'PLANS'       },
    { re: /investment|yield|blue[-\s]?chip/i,                           t1: 'INVESTMENT',    t2: 'OPPORTUNITY' },
    { re: /office park|office campus/i,                                 t1: 'PRIME',         t2: 'OFFICES'     },
    { re: /warehouse|industrial/i,                                      t1: 'PRIME',         t2: 'INDUSTRIAL'  },
    { re: /view|views|vista|panoramic/i,                                t1: 'BREATHTAKING',  t2: 'VIEWS'       }
  ];

  function deriveTags(raw) {
    const haystack = [
      raw.title, raw.pageTitle, raw.metaDescription,
      raw.feat1, raw.feat2, raw.feat3, raw.description
    ].filter(Boolean).join(' ');

    for (const rule of TAG_RULES) {
      if (rule.re.test(haystack)) {
        return { tag1: rule.t1, tag2: rule.t2 };
      }
    }
    return { tag1: 'PRIME', tag2: 'LOCATION' };
  }

  // ---------------------------------------------------------
  // HEADLINE DERIVATION — picks the strongest marketing angle
  // ---------------------------------------------------------
  function deriveHeadline(raw, facts) {
    const title = raw.title || raw.pageTitle || '';
    const haystack = [
      title, raw.metaDescription || '',
      raw.feat1 || '', raw.feat2 || '', raw.feat3 || '',
      raw.description || ''
    ].join(' ');

    // Block of flats / residential income
    if (/block of flats|residential block/i.test(haystack)) {
      if (facts && facts.units) return `${facts.units}-UNIT BLOCK OF FLATS`;
      const units = haystack.match(/(\d{1,3})\s*(?:units|flats|apartments)/i);
      if (units) return `${units[1]}-UNIT BLOCK OF FLATS`;
      return 'INCOME-PRODUCING BLOCK OF FLATS';
    }

    // Student accommodation
    if (/nsfas|student accom|student housing|bed facility/i.test(haystack)) {
      const beds = haystack.match(/(\d{2,4})[\s-]*bed/i);
      if (beds) return `${beds[1]}-BED STUDENT ACCOM.`;
      return 'STUDENT ACCOMMODATION';
    }

    // Fuel depot
    if (/fuel depot|million litre|storage capacity/i.test(haystack)) {
      const mil = haystack.match(/(\d+(?:\.\d+)?)\s*million\s*litre/i);
      if (mil) return `±${mil[1]} MILLION LITRE FUEL DEPOT`;
      return 'FUEL DEPOT';
    }

    // Industrial facility
    if (/industrial.*facility|heavy[-\s]?duty|industrial\s*1/i.test(haystack)) {
      const sz = raw.gla || raw.erf;
      if (sz) return `${sz} INDUSTRIAL FACILITY`;
      return 'INDUSTRIAL FACILITY';
    }

    // Office park / campus
    if (/office park|office campus/i.test(haystack)) {
      if (/highway|freeway|n1|n3|n12/i.test(haystack)) return 'HIGHWAY EXPOSURE OFFICE PARK';
      return 'PRIME OFFICE PARK';
    }

    // Corner / redevelopment
    if (/corner.*(site|property|redevelopment)|double[-\s]?plot/i.test(haystack)) {
      return 'STRATEGIC CORNER SITE';
    }

    // Development opportunity
    if (/development opportunity/i.test(haystack)) {
      if (/residential/i.test(haystack) && raw.erf) return `${raw.erf} RESIDENTIAL DEVELOPMENT`;
      if (raw.erf) return `${raw.erf} DEVELOPMENT OPPORTUNITY`;
      return 'DEVELOPMENT OPPORTUNITY';
    }

    // Family home (bedrooms-led)
    if (/family home|bedroom.*home|bed.*spacious/i.test(haystack) ||
        (facts && facts.beds && facts.beds >= 3)) {
      const br = facts && facts.beds ? facts.beds : null;
      if (br) return `${br}-BEDROOM FAMILY HOME`;
      return 'FAMILY HOME';
    }

    // Commercial / showroom
    if (/commercial|showroom|versatile/i.test(haystack)) {
      return 'HIGH-EXPOSURE COMMERCIAL PROPERTY';
    }

    // Fallback: use title stripped of suburb prefix
    let desc = title.includes(' - ')
      ? title.split(' - ').slice(1).join(' - ').trim()
      : title;
    return (desc.replace(/[|–].*$/, '').toUpperCase().trim().slice(0, 40)) || 'PROPERTY';
  }

  function splitHeadline(headline) {
    if (!headline) return { sub1: '', sub2: '' };
    if (headline.includes('|')) {
      const parts = headline.split('|').map(s => s.trim());
      return { sub1: parts[0], sub2: parts.slice(1).join(' | ') };
    }
    const words = headline.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { sub1: headline, sub2: '' };
    if (words.length === 2) return { sub1: words[0], sub2: words[1] };
    const lastWord = words[words.length - 1];
    if (lastWord.length >= 7 && words.length >= 3) {
      return { sub1: words.slice(0, -1).join(' '), sub2: lastWord };
    }
    const cut = Math.ceil(words.length / 2);
    return { sub1: words.slice(0, cut).join(' '), sub2: words.slice(cut).join(' ') };
  }

  // ---------------------------------------------------------
  // FACT EXTRACTION — distilled signals used by feature generator
  // ---------------------------------------------------------
  function extractFacts(raw) {
    const haystack = [
      raw.title || '', raw.pageTitle || '', raw.metaDescription || '',
      raw.feat1 || '', raw.feat2 || '', raw.feat3 || '',
      raw.description || ''
    ].join(' ');

    const facts = {
      units: null,
      beds: null,
      baths: null,
      storeys: null,
      monthlyIncome: null,
      annualIncome: null,
      occupancy: null,
      zoning: null,
      nsfas: /nsfas/i.test(haystack),
      fullyLet: /fully let|tenanted/i.test(haystack),
      hasSolar: /\bsolar\b/i.test(haystack),
      hasBorehole: /borehole/i.test(haystack),
      hasGenerator: /generator|back[-\s]?up power/i.test(haystack),
      hasSecurity: /24[-\s]?hour|24\/7|cctv|access control|patroll|security/i.test(haystack),
      nearHighway: /(n1|n2|n3|n4|n12|n14|r21|m1|highway|freeway)/i.test(haystack),
      nearUni: /university|\buj\b|\btut\b|\bwits\b|\bukzn\b|\bup\b|\buct\b|stellenbosch|milpark/i.test(haystack),
      garages: null,
      pool: /\bpool\b|swimming pool/i.test(haystack),
      garden: /\bgarden\b/i.test(haystack),
      approvedPlans: /approved (?:coj )?(?:building )?plans/i.test(haystack),
      corner: /corner (?:property|site|stand|plot)/i.test(haystack),
      signage: /signage/i.test(haystack),
      views: /\bviews?\b|panoramic|vista/i.test(haystack),
      pointOffice: /\boffice(s)?\b/i.test(haystack),
      pointWarehouse: /\bwarehouse\b/i.test(haystack),
      pointShowroom: /\bshowroom\b/i.test(haystack),
      pointRetail: /\bretail\b/i.test(haystack),
      pointIndustrial: /\bindustrial\b/i.test(haystack),
      pointStudentAccom: /student accom|student housing|nsfas/i.test(haystack),
      hasPatio: /\bpatio\b|entertainment area|braai/i.test(haystack),
      hasStudy: /\bstudy\b|home office/i.test(haystack)
    };

    // Units / flats / apartments
    const units = haystack.match(/(\d{1,3})\s*(?:units|flats|apartments)/i);
    if (units) facts.units = parseInt(units[1], 10);

    // Beds
    const beds = haystack.match(/(\d{1,3})[\s-]*bed(?:room)?s?\b/i);
    if (beds) facts.beds = parseInt(beds[1], 10);

    // Bathrooms
    const baths = haystack.match(/(\d{1,2})\s*bathrooms?/i);
    if (baths) facts.baths = parseInt(baths[1], 10);

    // Storeys
    const storeys = haystack.match(/(\d)[-\s]*(?:storey|story)/i);
    if (storeys) facts.storeys = parseInt(storeys[1], 10);

    // Garages
    const gar = haystack.match(/(\d)\s*garage/i);
    if (gar) facts.garages = parseInt(gar[1], 10);
    else if (/double garage/i.test(haystack)) facts.garages = 2;
    else if (/single garage/i.test(haystack)) facts.garages = 1;

    // Monthly income variants
    const milIncome = haystack.match(/monthly\s*income[:\s]*[±~]?\s*R\s*(\d+(?:\.\d+)?)\s*million/i);
    if (milIncome) {
      facts.monthlyIncome = `±R${milIncome[1]} Million`;
    } else {
      const monIncome = haystack.match(/monthly\s*(?:rental\s*)?income[:\s]*[±~]?\s*R\s*([\d\s,]+)/i);
      if (monIncome) facts.monthlyIncome = `R${monIncome[1].replace(/\s+/g, ' ').trim()}`;
    }

    // Annual income / NAI / GAI
    const naiMil = haystack.match(/(?:NAI|GAI|annual income|gross annual income)[:\s]*[±~]?\s*R\s*(\d+(?:\.\d+)?)\s*million/i);
    if (naiMil) {
      facts.annualIncome = `±R${naiMil[1]} Million p.a.`;
    } else {
      const nai = haystack.match(/(?:NAI|GAI|annual income|gross annual income)[:\s]*[±~]?\s*R\s*([\d\s,]+)/i);
      if (nai) facts.annualIncome = `R${nai[1].replace(/\s+/g, ' ').trim()} p.a.`;
    }

    // Occupancy
    const occ = haystack.match(/(\d{1,3})\s*%\s*occupancy/i);
    if (occ) facts.occupancy = parseInt(occ[1], 10);

    // Zoning
    const zoning = haystack.match(/zoned?\s*[:\-]?\s*(industrial\s*\d|business\s*\d|residential\s*\d|commercial|industrial|retail|mixed[-\s]?use)/i);
    if (zoning) facts.zoning = zoning[1].replace(/\s+/g, ' ').trim();

    return facts;
  }

  // ---------------------------------------------------------
  // MARKETING FEATURE REWRITER
  // Produces 3 tightened, promotional feature lines.
  // Draws from facts + size info. Does NOT copy raw website lines.
  // ---------------------------------------------------------

  /**
   * Push a candidate line if it's non-empty and not already present.
   */
  function addLine(arr, line) {
    if (!line) return;
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    if (arr.some(x => x.toLowerCase() === trimmed.toLowerCase())) return;
    arr.push(trimmed);
  }

  /**
   * Build a candidate pool of marketing lines from facts.
   * Ranked loosely from strongest to weakest.
   */
  function buildFeatureCandidates(raw, facts) {
    const pool = [];
    const hay = [
      raw.title || '', raw.metaDescription || '',
      raw.feat1 || '', raw.feat2 || '', raw.feat3 || '',
      raw.description || ''
    ].join(' ').toLowerCase();

    // ---- STRONGEST ANGLES FIRST ----

    // Block of flats / multi-unit residential with income
    if (facts.units && /block of flats|residential block|multi[-\s]?unit/i.test(hay)) {
      const storeyBit = facts.storeys ? `${facts.storeys}-Storey ` : '';
      addLine(pool, `${storeyBit}Residential Block with ${facts.units} Income-Producing Units`);
    } else if (facts.units) {
      addLine(pool, `${facts.units} Units on ${raw.erf || 'Prime Stand'}`);
    }

    // Fully let / income
    if (facts.fullyLet && facts.monthlyIncome) {
      addLine(pool, `Fully Let | Monthly Income: ${facts.monthlyIncome}`);
    } else if (facts.fullyLet) {
      addLine(pool, `Fully Let & Income-Producing`);
    } else if (facts.monthlyIncome) {
      addLine(pool, `Monthly Income: ${facts.monthlyIncome}`);
    }

    if (facts.annualIncome && !facts.monthlyIncome) {
      addLine(pool, `Gross Annual Income: ${facts.annualIncome}`);
    }

    // Student accom specifics
    if (facts.pointStudentAccom) {
      if (facts.nsfas && facts.monthlyIncome) {
        addLine(pool, `NSFAS Accredited | Monthly Income: ${facts.monthlyIncome}`);
      } else if (facts.nsfas) {
        addLine(pool, `NSFAS Accredited Student Facility`);
      }
      if (facts.occupancy) {
        addLine(pool, `Current Occupancy Rate: ±${facts.occupancy}%`);
      }
    }

    // Bedrooms + bathrooms (residential)
    if (facts.beds && facts.baths) {
      addLine(pool, `${facts.beds} Bedrooms + ${facts.baths} Bathrooms`);
    } else if (facts.beds) {
      addLine(pool, `${facts.beds} Bedrooms`);
    }

    // Garages + extras (residential)
    const resExtras = [];
    if (facts.hasStudy) resExtras.push('Home Office');
    if (facts.hasPatio) resExtras.push('Entertainment Patio');
    if (resExtras.length) addLine(pool, resExtras.join(' | '));

    const outdoor = [];
    if (facts.garden) outdoor.push('Private Garden');
    if (facts.pool) outdoor.push('Sparkling Pool');
    if (facts.garages === 2) outdoor.push('Double Garage');
    else if (facts.garages && facts.garages > 2) outdoor.push(`${facts.garages} Garages`);
    else if (facts.garages === 1) outdoor.push('Single Garage');
    if (outdoor.length) addLine(pool, outdoor.join(', '));

    // Commercial use mix
    const useMix = [];
    if (facts.pointOffice) useMix.push('Office');
    if (facts.pointShowroom) useMix.push('Showroom');
    if (facts.pointWarehouse) useMix.push('Warehouse');
    if (facts.pointRetail) useMix.push('Retail');
    if (useMix.length >= 2) {
      const stand = raw.erf ? ` on ${raw.erf} Stand` : '';
      addLine(pool, `${useMix.join(', ')}${stand}`);
    }

    // Zoning + versatility
    if (facts.zoning) {
      addLine(pool, `Zoning: ${facts.zoning} | Versatile Use`);
    }

    // Corner / signage / exposure
    if (facts.corner && facts.signage) {
      addLine(pool, `Corner Property with Excellent Signage & Exposure`);
    } else if (facts.corner) {
      addLine(pool, `Prominent Corner Property`);
    } else if (facts.signage) {
      addLine(pool, `High-Visibility Signage Opportunity`);
    }

    // Approved plans
    if (facts.approvedPlans) {
      addLine(pool, `Ready to Build: Approved Plans on File`);
    }

    // Views
    if (facts.views) addLine(pool, `Breathtaking Views`);

    // Security
    if (facts.hasSecurity) addLine(pool, `24-Hour Security & Access Control`);

    // Infra: solar / borehole / generator
    const infra = [];
    if (facts.hasSolar) infra.push('Solar Power');
    if (facts.hasBorehole) infra.push('Borehole');
    if (facts.hasGenerator) infra.push('Backup Generator');
    if (infra.length) addLine(pool, `Sustainable Infrastructure: ${infra.join(' + ')}`);

    // Location strengths
    if (facts.nearHighway) addLine(pool, `Excellent Access to Major Highways`);
    if (facts.nearUni) addLine(pool, `Prime Position Near Major Universities`);

    // Investor audience close-out
    addLine(pool, `Suitable for Owner-Occupiers or Investors`);

    // Size-only fallback lines
    if (raw.erf && !pool.some(l => l.includes(raw.erf))) {
      addLine(pool, `Total Stand Size: ${raw.erf}`);
    }
    if (raw.gla && !pool.some(l => l.includes(raw.gla))) {
      addLine(pool, `Gross Lettable Area: ${raw.gla}`);
    }

    return pool;
  }

  /**
   * Fall back to polished versions of the original feat1/2/3 if present.
   * Rewrites light-touch so it's not identical to website phrasing.
   */
  function polishExistingFeature(s) {
    if (!s) return '';
    let t = String(s).replace(/\s+/g, ' ').trim();
    // Normalise approx / ampersands / pipes
    t = t.replace(/\bapproximately\s+/gi, '±')
         .replace(/\bapprox\.?\s+/gi, '±')
         .replace(/±\s+/g, '±')
         .replace(/\s+and\s+/gi, ' & ')
         .replace(/\s*\|\s*/g, ' | ')
         .replace(/\s+/g, ' ')
         .trim();
    // Light marketing polish: common swaps
    t = t.replace(/\bavailable\b/gi, 'On Offer')
         .replace(/\bcurrently\s+let\b/gi, 'Fully Let')
         .replace(/\bgood\s+condition\b/gi, 'Excellent Condition');
    return t;
  }

  /**
   * Pick 3 best lines. Always returns an array of 3 strings (may be empty).
   */
  function chooseThreeFeatures(raw, facts) {
    const generated = buildFeatureCandidates(raw, facts);

    // Prepend polished versions of raw features if they exist AND are sufficiently
    // different from what we already generated. This preserves value when the raw
    // listing had uniquely specific facts.
    const polished = [raw.feat1, raw.feat2, raw.feat3]
      .map(polishExistingFeature)
      .filter(Boolean);

    // Merge: generated first (marketing-rewritten), then polished originals as backups
    const merged = [];
    for (const g of generated) addLine(merged, g);
    for (const p of polished) {
      // Skip if already covered by a generated line (rough heuristic)
      const pLower = p.toLowerCase();
      const covered = merged.some(m => {
        const ml = m.toLowerCase();
        return ml === pLower || (ml.length > 15 && pLower.includes(ml.slice(0, 15)));
      });
      if (!covered) addLine(merged, p);
    }

    // Trim each to a reasonable marketing length (flyer box fits ~60 chars comfortably)
    const trimmed = merged.map(l => (l.length > 75 ? l.slice(0, 72).trim() + '…' : l));

    // Return exactly 3 lines (pad with empty strings if short)
    return [trimmed[0] || '', trimmed[1] || '', trimmed[2] || ''];
  }

  // ---------------------------------------------------------
  // SUBURB / CITY CLEANUP
  // ---------------------------------------------------------
  function cleanSuburb(s) {
    if (!s) return '';
    return s.replace(/\s+/g, ' ').trim();
  }

  function cleanCity(s) {
    if (!s) return '';
    return s.replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------
  // MAIN TRANSFORMER
  // ---------------------------------------------------------
  function transformToSummary(raw) {
    if (!raw) return null;

    const facts = extractFacts(raw);
    const headline = deriveHeadline(raw, facts);
    const { sub1, sub2 } = splitHeadline(headline);
    const { tag1, tag2 } = deriveTags(raw);
    const [f1, f2, f3] = chooseThreeFeatures(raw, facts);

    return {
      headline: headline,
      subheadline: sub1,
      subheadline2: sub2,
      city: cleanCity(raw.city),
      suburb: cleanSuburb(raw.suburb),
      tag1: tag1,
      tag2: tag2,
      feat1: f1,
      feat2: f2,
      feat3: f3,
      erf: raw.erf || '',
      gla: raw.gla || '',
      // Pass-through signals (used by extract-ui for optional date/time prefill + broker)
      _brokerId: raw.brokerId || null,
      _auctionDate: raw.auctionDate || null,
      _auctionTime: raw.auctionTime || null,
      _sourceUrl: raw.sourceUrl || null
      // address intentionally not included — preserved by form
    };
  }

  window.AI_transformToSummary = transformToSummary;
})();
