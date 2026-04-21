// =====================
// EXTRACT UI ORCHESTRATOR
// =====================
// Connects the Stage 2 pipeline to the form UI.
//
// Responsibilities:
// - Fetch listing HTML from URL (best-effort via proxy)
// - Parse pasted HTML/source or plain listing text
// - Transform extracted facts into AuctionInc-style summary fields
// - Populate the existing form WITHOUT overwriting address
// - Auto-select inferred broker if detected
// - Optionally set date/time if found
//
// Safe by design:
// - If anything fails, manual workflow still works
// - Address remains untouched
// - Existing export/template logic is not changed
//
// Exposed helpers:
//   window.AI_runGenerateFromUrl
//   window.AI_runGenerateFromSource
//   window.AI_populateSummaryForm

(function () {
  'use strict';

  // ---------------------------------------------------------
  // DOM HELPERS
  // ---------------------------------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function firstExistingId(ids) {
    for (const id of ids) {
      const el = $(id);
      if (el) return el;
    }
    return null;
  }

  function setStatus(message, type) {
    const el = $('extract-status');
    if (!el) return;

    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';

    // reset classes
    el.classList.remove('is-success', 'is-error', 'is-warning', 'is-info');

    switch (type) {
      case 'success':
        el.classList.add('is-success');
        break;
      case 'error':
        el.classList.add('is-error');
        break;
      case 'warning':
        el.classList.add('is-warning');
        break;
      default:
        el.classList.add('is-info');
        break;
    }
  }

  function setBusy(isBusy) {
    const ids = [
      'fetch-generate-btn',
      'generate-from-source-btn',
      'listing-fetch-btn',
      'listing-source-btn',
      'generate-from-url-btn'
    ];

    ids.forEach(id => {
      const btn = $(id);
      if (btn) btn.disabled = !!isBusy;
    });
  }

  function valueOf(id) {
    const el = $(id);
    return el ? (el.value || '').trim() : '';
  }

  function setValueIfExists(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------------------------------------------------------
  // FORM FIELD MAP
  // ---------------------------------------------------------
  const FIELD_MAP = {
    headline: 'headline',
    subheadline: 'subheadline',
    subheadline2: 'subheadline2',
    city: 'city',
    suburb: 'suburb',
    tag1: 'tag1',
    tag2: 'tag2',
    feat1: 'feat1',
    feat2: 'feat2',
    feat3: 'feat3',
    erf: 'erf-size',
    gla: 'gla'
  };

  // ---------------------------------------------------------
  // BROKER HELPERS
  // ---------------------------------------------------------
  function getBrokerSelect() {
    return $('broker');
  }

  function normaliseBrokerName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function inferBrokerIdFromRaw(raw) {
    if (!raw) return null;

    // 1. Trust parser if already set
    if (raw.brokerId) return raw.brokerId;

    // 2. Try matching broker name/email against BROKERS map if available
    const brokerMap = window.BROKERS || window.AI_BROKERS || null;
    if (!brokerMap) return null;

    const haystack = [
      raw.brokerName || '',
      raw.brokerEmail || '',
      raw.description || '',
      raw.metaDescription || '',
      raw.pageTitle || '',
      raw.title || '',
      raw.rawText || ''
    ].join(' ').toLowerCase();

    for (const [brokerId, broker] of Object.entries(brokerMap)) {
      const name = normaliseBrokerName(broker && broker.name ? broker.name : brokerId);
      const email = String(broker && broker.email ? broker.email : '').toLowerCase().trim();

      if (name && haystack.includes(name)) return brokerId;
      if (email && haystack.includes(email)) return brokerId;
    }

    return null;
  }

  function applyBrokerIfDetected(raw, summary) {
    const brokerSelect = getBrokerSelect();
    if (!brokerSelect) return false;

    const brokerId =
      (summary && summary._brokerId) ||
      inferBrokerIdFromRaw(raw);

    if (!brokerId) return false;

    const optionExists = Array.from(brokerSelect.options).some(opt => opt.value === brokerId);
    if (!optionExists) return false;

    brokerSelect.value = brokerId;
    brokerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ---------------------------------------------------------
  // DATE / TIME HELPERS
  // ---------------------------------------------------------
  function parseAuctionDateString(dateString) {
    if (!dateString) return null;

    // Accept ISO directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;

    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseAuctionTimeString(timeString) {
    if (!timeString) return null;

    // Already HH:MM
    if (/^\d{2}:\d{2}$/.test(timeString)) return timeString;

    const t = String(timeString).toLowerCase().trim();

    const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return null;

    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const mer = m[3] ? m[3].toLowerCase() : null;

    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  function applyDateTimeIfDetected(summary, raw) {
    const datePicker = $('date-picker');
    const timePicker = $('time-picker');

    const rawDate = (summary && summary._auctionDate) || (raw && raw.auctionDate) || null;
    const rawTime = (summary && summary._auctionTime) || (raw && raw.auctionTime) || null;

    const safeDate = parseAuctionDateString(rawDate);
    const safeTime = parseAuctionTimeString(rawTime);

    if (datePicker && safeDate) {
      datePicker.value = safeDate;
      datePicker.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (timePicker && safeTime) {
      timePicker.value = safeTime;
      timePicker.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ---------------------------------------------------------
  // POPULATE FORM
  // ---------------------------------------------------------
  function populateSummaryForm(summary, raw) {
    if (!summary || typeof summary !== 'object') {
      throw new Error('No summary object to populate.');
    }

    // Never touch address
    Object.entries(FIELD_MAP).forEach(([summaryKey, fieldId]) => {
      setValueIfExists(fieldId, summary[summaryKey] || '');
    });

    applyBrokerIfDetected(raw, summary);
    applyDateTimeIfDetected(summary, raw);

    // Keep URL for reference if a hidden/reference field exists
    const sourceUrlEl = firstExistingId(['source-url', 'listing-source-url', 'listing-url-ref']);
    if (sourceUrlEl && summary._sourceUrl) {
      sourceUrlEl.value = summary._sourceUrl;
    }

    return true;
  }

  // ---------------------------------------------------------
  // PARSE + TRANSFORM
  // ---------------------------------------------------------
  function requireFns() {
    if (typeof window.AI_transformToSummary !== 'function') {
      throw new Error('AI_transformToSummary is not loaded.');
    }

    // Support either parser name
    const parser =
      window.AI_parseListingSource ||
      window.AI_parseListingText ||
      null;

    if (typeof parser !== 'function') {
      throw new Error('Listing parser is not loaded.');
    }

    return {
      parser,
      transformer: window.AI_transformToSummary
    };
  }

  function parseAndTransform(source, opts) {
    const { parser, transformer } = requireFns();

    const raw = parser(source || '', opts || {}) || {};
    const summary = transformer(raw);

    if (!summary) {
      throw new Error('Transform returned no summary.');
    }

    return { raw, summary };
  }

  // ---------------------------------------------------------
  // URL FLOW
  // ---------------------------------------------------------
  async function runGenerateFromUrl() {
    const url =
      valueOf('listing-url') ||
      valueOf('auction-url') ||
      valueOf('url-input');

    if (!url) {
      setStatus('Please paste a listing URL first.', 'warning');
      return;
    }

    if (typeof window.AI_fetchListingUrl !== 'function') {
      setStatus('URL fetcher is not loaded.', 'error');
      return;
    }

    setBusy(true);
    setStatus('Fetching listing page…', 'info');

    try {
      const fetched = await window.AI_fetchListingUrl(url);

      if (!fetched || !fetched.ok || !fetched.html) {
        const reason = fetched && fetched.reason ? ` ${fetched.reason}.` : '';
        setStatus(
          `Could not fetch the page from URL.${reason} Paste page source or visible listing text into the source box instead.`,
          'warning'
        );
        return;
      }

      setStatus('Page fetched. Extracting and generating copy…', 'info');

      const { raw, summary } = parseAndTransform(fetched.html, {
        sourceType: 'html',
        sourceUrl: url
      });

      // preserve source url if parser/transformer did not
      if (!summary._sourceUrl) summary._sourceUrl = url;
      if (!raw.sourceUrl) raw.sourceUrl = url;

      populateSummaryForm(summary, raw);

      const proxyLabel = fetched.proxyUsed ? ` via ${fetched.proxyUsed}` : '';
      setStatus(`Fields populated successfully from URL${proxyLabel}.`, 'success');

    } catch (err) {
      console.error(err);
      setStatus(
        `URL generation failed: ${err && err.message ? err.message : err}`,
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------
  // SOURCE / TEXTAREA FLOW
  // ---------------------------------------------------------
  async function runGenerateFromSource() {
    const source =
      valueOf('listing-source') ||
      valueOf('listing-text') ||
      valueOf('listing-html') ||
      valueOf('description');

    const sourceUrl =
      valueOf('listing-url') ||
      valueOf('auction-url') ||
      valueOf('url-input');

    if (!source) {
      setStatus('Paste listing HTML, page source, or visible listing text first.', 'warning');
      return;
    }

    setBusy(true);
    setStatus('Extracting and generating copy…', 'info');

    try {
      const sourceType = /<html|<!doctype|<head|<body|<meta|<title/i.test(source)
        ? 'html'
        : 'text';

      const { raw, summary } = parseAndTransform(source, {
        sourceType,
        sourceUrl: sourceUrl || ''
      });

      if (sourceUrl && !summary._sourceUrl) summary._sourceUrl = sourceUrl;
      if (sourceUrl && !raw.sourceUrl) raw.sourceUrl = sourceUrl;

      populateSummaryForm(summary, raw);

      setStatus('Fields populated successfully from pasted source.', 'success');

    } catch (err) {
      console.error(err);
      setStatus(
        `Source generation failed: ${err && err.message ? err.message : err}`,
        'error'
      );
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------
  // WIRE BUTTONS
  // ---------------------------------------------------------
  function wireButton(id, handler) {
    const btn = $(id);
    if (!btn) return false;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      handler();
    });
    return true;
  }

  function wireUi() {
    // Common IDs Claude may have used
    wireButton('fetch-generate-btn', runGenerateFromUrl);
    wireButton('listing-fetch-btn', runGenerateFromUrl);
    wireButton('generate-from-url-btn', runGenerateFromUrl);

    wireButton('generate-from-source-btn', runGenerateFromSource);
    wireButton('listing-source-btn', runGenerateFromSource);

    // Optional convenience: Ctrl/Cmd+Enter inside textarea triggers source generation
    const sourceBox =
      $('listing-source') ||
      $('listing-text') ||
      $('listing-html');

    if (sourceBox) {
      sourceBox.addEventListener('keydown', function (e) {
        const isEnter = e.key === 'Enter';
        const hasMod = e.ctrlKey || e.metaKey;
        if (isEnter && hasMod) {
          e.preventDefault();
          runGenerateFromSource();
        }
      });
    }

    // Start hidden if status box exists
    const statusEl = $('extract-status');
    if (statusEl && !statusEl.textContent.trim()) {
      statusEl.style.display = 'none';
    }
  }

  // ---------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------
  document.addEventListener('DOMContentLoaded', wireUi);

  // ---------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------
  window.AI_runGenerateFromUrl = runGenerateFromUrl;
  window.AI_runGenerateFromSource = runGenerateFromSource;
  window.AI_populateSummaryForm = populateSummaryForm;
})();
