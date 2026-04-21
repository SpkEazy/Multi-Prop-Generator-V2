// =====================
// LISTING → CANONICAL SUMMARY TRANSFORMER
// =====================
// Produces AuctionInc-style marketing copy from extracted facts.
// Rewrites — does NOT merely copy — the raw listing description.
//
// Canonical output consumed by extract-ui → form fields:
//   headline, subheadline, subheadline2,
//   city, suburb,
//   tag1, tag2,
//   feat1, feat2, feat3,
//   erf, gla,
//   _brokerId, _auctionDate, _auctionTime, _sourceUrl
//
// Exposed as window.AI_transformToSummary.

(function () {
  'use strict';

  // ---------------------------------------------------------
  // TAG RULES — first match wins; order = priority
  // ---------------------------------------------------------
  const TAG_RULES = [
    { re: /architectural\s*(masterpiece|gem)|iconic|bespoke|landmark home/i, t1: 'ARCHITECTURAL', t2: 'MASTERPIECE' },
    { re: /fully let|tenanted|currently let|income[-\s]?producing/i,         t1: 'FULLY',         t2: 'LET'         },
    { re: /liquidation/i,                                                    t1: 'LIQUIDATION',   t2: 'SALE'        },
    { re: /deceased estate/i,                                                t1: 'DECEASED',      t2: 'ESTATE'      },
    { re: /double[-\s]?volume|overhead crane|high[-\s]?bay/i,                t1: 'DOUBLE',        t2: 'VOLUME'      },
    { re: /fuel depot|bulk storage|million litre|storage capacity/i,         t1: 'STRATEGIC',     t2: 'LOCATION'    },
    { re: /nsfas|student accom|student housing|occupancy rate/i,             t1: 'HIGH',          t2: 'YIELD'       },
    { re: /corner|redevelopment|double[-\s]?plot/i,                          t1: 'REDEVELOPMENT', t2: 'OPPORTUNITY' },
    { re: /block of flats|residential block|multi[-\s]?unit/i,               t1: 'RESIDENTIAL',   t2: 'INCOME'      },
    { re: /signage|high[-\s]?visibility|arterial|exposure/i,                 t1: 'SIGNAGE',       t2: 'OPPORTUNITY' },
    { re: /gated estate|estate living|sought[-\s]?after/i,                   t1: 'SOUGHT-AFTER',  t2: 'ESTATE'      },
    { re: /near uj|university of johannesburg|milpark/i,                     t1: 'NEAR',          t2: 'UJ'          },
    { re: /near tut|tshwane university/i,                                    t1: 'NEAR',          t2: 'TUT'         },
    { re: /near wits/i,                                                      t1: 'NEAR',          t2: 'WITS'        },
    { re: /development opportunity|development potential|re[-\s]?zoned/i,    t1: 'DEVELOPMENT',   t2: 'POTENTIAL'   },
    { re: /approved (plans|building plans)|shovel[-\s]?ready/i,              t1: 'APPROVED',      t2: 'PLANS'       },
    { re: /investment|yield|blue[-\s]?chip/i,                                t1: 'INVESTMENT',    t2: 'OPPORTUNITY' },
    { re: /office park|office campus/i,                                      t1: 'PRIME',         t2: 'OFFICES'     },
    { re: /warehouse|industrial/i,                                           t1: 'PRIME',         t2: 'INDUSTRIAL'  },
    { re: /smallholding|farm|agricultural|equestrian/i,                      t1: 'COUNTRY',       t2: 'LIVING'      },
    { re: /view|views|vista|panoramic/i,                                     t1: 'BREATHTAKING',  t2: 'VIEWS'       },
    { re: /family home|bedroom|luxury|entertain|swimming pool|pool/i,        t1: 'LUXURY',        t2: 'LIVING'      }
  ];

  function haystackOf(raw) {
    return [
      raw.title, raw.subtitle, raw.pageTitle, raw.metaDescription,
      raw.feat1, raw.feat2, raw.feat3,
      (raw.bulletFeatures || []).join(' '),
      raw.description, raw.rawText
    ].filter(Boolean).join(' ');
  }

  function deriveTags(raw) {
    const h = haystackOf(raw);
    for (const rule of TAG_RULES) {
      if (rule.re.test(h)) return { tag1: rule.t1, tag2: rule.t2 };
    }
    return { tag1: 'PRIME', tag2: 'OPPORTUNITY' };
  }

  // ---------------------------------------------------------
  // HEADLINE DERIVATION
  // ---------------------------------------------------------
  function deriveHeadline(raw, facts) {
    const title = raw.title || raw.pageTitle || '';
    const h = haystackOf(raw);

    if (/architectural\s*masterpiece/i.test(h)) return 'ARCHITECTURAL MASTERPIECE';

    if (/block of flats|residential block/i.test(h)) {
      if (facts.units) return `${facts.units}-UNIT BLOCK OF FLATS`;
      return 'INCOME-PRODUCING BLOCK OF FLATS';
    }

    if (/nsfas|student accom|student housing|bed facility/i.test(h)) {
      const beds = h.match(/(\d{2,4})[\s-]*bed/i);
      if (beds) return `${beds[1]}-BED STUDENT ACCOM.`;
      return 'STUDENT ACCOMMODATION';
    }

    if (/fuel depot|million litre|storage capacity/i.test(h)) {
      const mil = h.match(/(\d+(?:\.\d+)?)\s*million\s*litre/i);
      if (mil) return `±${mil[1]} MILLION LITRE FUEL DEPOT`;
      return 'FUEL DEPOT';
    }

    if (/industrial.*facility|heavy[-\s]?duty|industrial\s*1/i.test(h)) {
      const sz = raw.gla || raw.erf;
      if (sz) return `${sz} INDUSTRIAL FACILITY`;
      return 'INDUSTRIAL FACILITY';
    }

    if (/office park|office campus/i.test(h)) {
      if (/highway|freeway|n1|n3|n12/i.test(h)) return 'HIGHWAY EXPOSURE OFFICE PARK';
      return 'PRIME OFFICE PARK';
    }

    if (/corner.*(site|property|redevelopment)|double[-\s]?plot/i.test(h)) {
      return 'STRATEGIC CORNER SITE';
    }

    if (/development opportunity/i.test(h)) {
      if (/residential/i.test(h) && raw.erf) return `${raw.erf} RESIDENTIAL DEVELOPMENT`;
      if (raw.erf) return `${raw.erf} DEVELOPMENT OPPORTUNITY`;
      return 'DEVELOPMENT OPPORTUNITY';
    }

    if (/smallholding|small holding|agricultural holding/i.test(h)) {
      if (raw.erf) return `${raw.erf} SMALLHOLDING`;
      return 'COUNTRY SMALLHOLDING';
    }

    if (/family home|bedroom.*home|luxury home|executive home|residence/i.test(h) ||
        (facts.beds && facts.beds >= 3)) {
      if (facts.beds) return `${facts.beds}-BEDROOM FAMILY HOME`;
      return 'LUXURY FAMILY HOME';
    }

    if (/commercial|showroom|versatile/i.test(h)) {
      return 'HIGH-EXPOSURE COMMERCIAL PROPERTY';
    }

    // Fallback: clean up the page title
    let t = title
      .replace(/\s*[|\-–]\s*auction\s*inc.*$/i, '')
      .replace(/^auctioninc\s*[-|–]\s*/i, '')
      .trim();
    if (t.includes(' - ')) t = t.split(' - ').slice(1).join(' - ').trim();
    return (t.toUpperCase().trim().slice(0, 40)) || 'PRIME PROPERTY';
  }

  // Split a headline into two visual lines for the template.
  function splitHeadline(headline) {
    if (!headline) return { sub1: '', sub2: '' };

    if (headline.includes('|')) {
      const parts = headline.split('|').map(s => s.trim());
      return { sub1: parts[0], sub2: parts.slice(1).join(' | ') };
    }

    const words = headline.split(/\s+/).filter(Boolean);
    if (words.length <= 1) return { sub1: headline, sub2: '' };
    if (words.length === 2) return { sub1: words[0], sub2: words[1] };

    const last = words[words.length - 1];
    if (last.length >= 7 && words.length >= 3) {
      return { sub1: words.slice(0, -1).join(' '), sub2: last };
    }
    const cut = Math.ceil(words.length / 2);
    return { sub1: words.slice(0, cut).join(' '), sub2: words.slice(cut).join(' ') };
  }

  // ---------------------------------------------------------
  // FACT EXTRACTION
  // ---------------------------------------------------------
  function extractFacts(raw) {
    const h = haystackOf(raw);

    const facts = {
      units: null,
      beds: null,
      baths: null,
      storeys: null,
      monthlyIncome: null,
      annualIncome: null,
      occupancy: null,
      zoning: null,
      nsfas: /nsfas/i.test(h),
      fullyLet: /fully let|tenanted/i.test(h),
      hasSolar: /\bsolar\b/i.test(h),
      hasBorehole: /borehole/i.test(h),
      hasGenerator: /generator|back[-\s]?up power/i.test(h),
      hasSecurity: /24[-\s]?hour|24\/7|cctv|access control|patroll|security/i.test(h),
      nearHighway: /(n1|n2|n3|n4|n12|n14|r21|m1|highway|freeway)/i.test(h),
      nearUni: /university|\buj\b|\btut\b|\bwits\b|\bukzn\b|\bup\b|\buct\b|stellenbosch|milpark/i.test(h),
      garages: null,
      pool: /\bpool\b|swimming pool/i.test(h),
      garden: /\bgarden\b|landscaped/i.test(h),
      approvedPlans: /approved (?:coj )?(?:building )?plans/i.test(h),
      corner: /corner (?:property|site|stand|plot)/i.test(h),
      signage: /signage/i.test(h),
      views: /\bviews?\b|panoramic|vista/i.test(h),
      pointOffice: /\boffice(s)?\b/i.test(h),
      pointWarehouse: /\bwarehouse\b/i.test(h),
      pointShowroom: /\bshowroom\b/i.test(h),
      pointRetail: /\bretail\b/i.test(h),
      pointIndustrial: /\bindustrial\b/i.test(h),
      pointStudentAccom: /student accom|student housing|nsfas/i.test(h),
      hasPatio: /\bpatio\b|entertainment area|braai/i.test(h),
      hasStudy: /\bstudy\b|home office/i.test(h),
      isSmallholding: /smallholding|small holding|agricultural holding/i.test(h),
      isArchitectural: /architectural\s*(masterpiece|gem)|bespoke|designer home/i.test(h)
    };

    const units = h.match(/(\d{1,3})\s*(?:units|flats|apartments)/i);
    if (units) facts.units = parseInt(units[1], 10);

    const beds = h.match(/(\d{1,3})[\s-]*bed(?:room)?s?\b/i);
    if (beds) facts.beds = parseInt(beds[1], 10);

    const baths = h.match(/(\d{1,2})\s*bathrooms?/i);
    if (baths) facts.baths = parseInt(baths[1], 10);

    const storeys = h.match(/(\d)[-\s]*(?:storey|story)/i);
    if (storeys) facts.storeys = parseInt(storeys[1], 10);

    const gar = h.match(/(\d)\s*garages?/i);
    if (gar) facts.garages = parseInt(gar[1], 10);
    else if (/double garage/i.test(h)) facts.garages = 2;
    else if (/single garage/i.test(h)) facts.garages = 1;
    else if (/triple garage/i.test(h)) facts.garages = 3;

    // Income
    const milIncome = h.match(/monthly\s*income[:\s]*[±~]?\s*R\s*(\d+(?:\.\d+)?)\s*million/i);
    if (milIncome) {
      facts.monthlyIncome = `±R${milIncome[1]} Million`;
    } else {
      const monIncome = h.match(/monthly\s*(?:rental\s*)?income[:\s]*[±~]?\s*R\s*([\d\s,]+)/i);
      if (monIncome) facts.monthlyIncome = `R${monIncome[1].replace(/\s+/g, ' ').trim()}`;
    }

    const naiMil = h.match(/(?:NAI|GAI|annual income|gross annual income)[:\s]*[±~]?\s*R\s*(\d+(?:\.\d+)?)\s*million/i);
    if (naiMil) {
      facts.annualIncome = `±R${naiMil[1]} Million p.a.`;
    } else {
      const nai = h.match(/(?:NAI|GAI|annual income|gross annual income)[:\s]*[±~]?\s*R\s*([\d\s,]+)/i);
      if (nai) facts.annualIncome = `R${nai[1].replace(/\s+/g, ' ').trim()} p.a.`;
    }

    const occ = h.match(/(\d{1,3})\s*%\s*occupancy/i);
    if (occ) facts.occupancy = parseInt(occ[1], 10);

    const zoning = h.match(/zoned?\s*[:\-]?\s*(industrial\s*\d|business\s*\d|residential\s*\d|commercial|industrial|retail|mixed[-\s]?use)/i);
    if (zoning) facts.zoning = zoning[1].replace(/\s+/g, ' ').trim();

    return facts;
  }

  // ---------------------------------------------------------
  // MARKETING FEATURE REWRITER
  // ---------------------------------------------------------
  function addLine(arr, line) {
    if (!line) return;
    const trimmed = String(line).replace(/\s+/g, ' ').trim();
    if (!trimmed) return;
    if (arr.some(x => x.toLowerCase() === trimmed.toLowerCase())) return;
    arr.push(trimmed);
  }

  function buildFeatureCandidates(raw, facts) {
    const pool = [];
    const h = haystackOf(raw).toLowerCase();

    // ---- RESIDENTIAL / ARCHITECTURAL ----
    if (facts.isArchitectural) {
      const bedPart = facts.beds ? `${facts.beds}-Bedroom ` : '';
      addLine(pool, `${bedPart}Architectural Masterpiece on ${raw.erf || 'Premium Stand'}`);
    }

    // Block of flats / multi-unit with income
    if (facts.units && /block of flats|residential block|multi[-\s]?unit/i.test(h)) {
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

    // Student accom
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

    // Bedrooms + bathrooms
    if (facts.beds && facts.baths) {
      addLine(pool, `${facts.beds} Bedrooms + ${facts.baths} Bathrooms`);
    } else if (facts.beds) {
      addLine(pool, `${facts.beds} Bedrooms`);
    }

    // Indoor extras
    const resExtras = [];
    if (facts.hasStudy) resExtras.push('Home Office');
    if (facts.hasPatio) resExtras.push('Entertainment Patio');
    if (resExtras.length) addLine(pool, resExtras.join(' | '));

    // Outdoor / garage
    const outdoor = [];
    if (facts.garden) outdoor.push('Landscaped Garden');
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

    // Zoning
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
    if (facts.views) addLine(pool, `Breathtaking Panoramic Views`);

    // Security
    if (facts.hasSecurity) addLine(pool, `24-Hour Security & Access Control`);

    // Off-grid infra
    const infra = [];
    if (facts.hasSolar) infra.push('Solar Power');
    if (facts.hasBorehole) infra.push('Borehole');
    if (facts.hasGenerator) infra.push('Backup Generator');
    if (infra.length) addLine(pool, `Sustainable Infrastructure: ${infra.join(' + ')}`);

    // Location strengths
    if (facts.nearHighway) addLine(pool, `Excellent Access to Major Highways`);
    if (facts.nearUni) addLine(pool, `Prime Position Near Major Universities`);

    // Smallholding / lifestyle
    if (facts.isSmallholding) {
      addLine(pool, `Spacious Smallholding with Lifestyle Appeal`);
    }

    // Audience close-out
    addLine(pool, `Suitable for Owner-Occupiers or Investors`);

    // Size-only fallbacks
    if (raw.erf && !pool.some(l => l.includes(raw.erf))) {
      addLine(pool, `Total Stand Size: ${raw.erf}`);
    }
    if (raw.gla && !pool.some(l => l.includes(raw.gla))) {
      addLine(pool, `Gross Lettable Area: ${raw.gla}`);
    }

    return pool;
  }

  // Light polish for fallback lines from raw website bullets
  function polishExistingFeature(s) {
    if (!s) return '';
    let t = String(s).replace(/\s+/g, ' ').trim();

    // Strip leading bullet glyphs
    t = t.replace(/^[\-\•\●\*\u2022\u25CF]\s*/, '');

    // Normalise approximations and separators
    t = t.replace(/\bapproximately\s+/gi, '±')
         .replace(/\bapprox\.?\s+/gi, '±')
         .replace(/±\s+/g, '±')
         .replace(/\s+and\s+/gi, ' & ')
         .replace(/\s*\|\s*/g, ' | ')
         .replace(/\s+/g, ' ')
         .trim();

    // Light marketing polish
    t = t.replace(/\bavailable\b/gi, 'On Offer')
         .replace(/\bcurrently\s+let\b/gi, 'Fully Let')
         .replace(/\bgood\s+condition\b/gi, 'Excellent Condition');

    // Trim trailing punctuation for consistency
    t = t.replace(/[.;,]+$/, '').trim();

    return t;
  }

  function chooseThreeFeatures(raw, facts) {
    const generated = buildFeatureCandidates(raw, facts);

    // Prefer generated marketing lines, then back-fill with polished raw lines
    const rawBullets = [];
    if (Array.isArray(raw.bulletFeatures) && raw.bulletFeatures.length) {
      raw.bulletFeatures.forEach(b => rawBullets.push(b));
    }
    [raw.feat1, raw.feat2, raw.feat3].forEach(v => { if (v) rawBullets.push(v); });

    const polished = rawBullets.map(polishExistingFeature).filter(Boolean);

    const merged = [];
    for (const g of generated) addLine(merged, g);
    for (const p of polished) {
      const pLower = p.toLowerCase();
      const covered = merged.some(m => {
        const ml = m.toLowerCase();
        return ml === pLower || (ml.length > 15 && pLower.includes(ml.slice(0, 15)));
      });
      if (!covered) addLine(merged, p);
    }

    // Trim to a comfortable marketing length
    const trimmed = merged.map(l => (l.length > 75 ? l.slice(0, 72).trim() + '…' : l));

    return [trimmed[0] || '', trimmed[1] || '', trimmed[2] || ''];
  }

  // ---------------------------------------------------------
  // CITY / SUBURB NORMALISATION
  // ---------------------------------------------------------
  function cleanSuburb(s) {
    if (!s) return '';
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function cleanCity(s) {
    if (!s) return '';
    return String(s).replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------
  // AREA NORMALISATION (safety net, matches extractor)
  // Extractor already formats raw.erf/raw.gla. This ensures
  // any pre-formatted or loosely-formatted size coming in still
  // ends up tidy.
  // ---------------------------------------------------------
  function normaliseArea(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (!s) return '';

    // Already perfect
    if (/^±\d[\d\s]*(m²|Ha)$/.test(s)) return s;

    const isHa = /\b(ha|hectares?)\b/i.test(s);
    const m = s.match(/([\d]+(?:[.,]\d+)?)/);
    if (!m) return s;

    if (isHa) {
      const numStr = m[1].replace(',', '.');
      return `±${numStr}Ha`;
    }

    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    if (!n) return s;
    const pretty = n.toLocaleString('en-ZA').replace(/,/g, ' ');
    return `±${pretty}m²`;
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
      erf: normaliseArea(raw.erf),
      gla: normaliseArea(raw.gla),

      // Pass-through signals for extract-ui
      _brokerId:     raw.brokerId     || null,
      _auctionDate:  raw.auctionDate  || null,
      _auctionTime:  raw.auctionTime  || null,
      _sourceUrl:    raw.sourceUrl    || null

      // address intentionally omitted — preserved by form
    };
  }

  window.AI_transformToSummary = transformToSummary;
})();
