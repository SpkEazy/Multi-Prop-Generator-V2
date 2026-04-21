// =====================
// EXTRACT UI ORCHESTRATOR
// =====================
// Wires the Stage 2 pipeline to the real DOM controls in index.html:
//   #btn-fetch-url        → URL fetch + parse + populate
//   #btn-extract          → Pasted source parse + populate
//   #btn-extract-clear    → Clear pasted source + status
//
// Safe:
//   - address field is NEVER overwritten
//   - manual workflow remains intact if anything fails
//   - templates/exports are not touched

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function setStatus(message, type) {
    const el = $('extract-status');
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('success', 'warning', 'error', 'info');
    if (type) el.classList.add(type);
  }

  function setBusy(isBusy) {
    ['btn-fetch-url', 'btn-extract', 'btn-extract-clear'].forEach(id => {
      const b = $(id);
      if (b) b.disabled = !!isBusy;
    });
  }

  function valueOf(id) {
    const el = $(id);
    return el ? (el.value || '').trim() : '';
  }

  function setValueIfExists(id, value) {
    const el = $(id);
    if (!el) return;
    // Do NOT overwrite if incoming value is empty
    if (value === null || value === undefined || value === '') return;
    el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Summary-key → form-field-id (address is intentionally absent)
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

  // ---------- Broker ----------
  function getBrokerSelect() { return $('broker'); }

  function setInferredBadge(broker) {
    const badge = $('broker-inferred-badge');
    if (!badge) return;
    if (broker && broker.name) {
      badge.textContent = 'inferred: ' + broker.name;
      badge.className = 'broker-inferred-pill';
    } else {
      badge.textContent = '';
      badge.className = '';
    }
  }

  function applyBrokerIfDetected(summary, raw) {
    const select = getBrokerSelect();
    if (!select) return false;

    const brokerId =
      (summary && summary._brokerId) ||
      (raw && raw.brokerId) ||
      null;

    if (!brokerId) {
      setInferredBadge(null);
      return false;
    }

    const exists = Array.from(select.options).some(o => o.value === brokerId);
    if (!exists) {
      setInferredBadge(null);
      return false;
    }

    select.value = brokerId;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const map = window.AI_BROKERS || {};
    setInferredBadge(map[brokerId] || { name: brokerId });
    return true;
  }

  // ---------- Date / time ----------
  function applyDateTimeIfDetected(summary, raw) {
    const dp = $('date-picker');
    const tp = $('time-picker');

    const rawDate = (summary && summary._auctionDate) || (raw && raw.auctionDate) || null;
    const rawTime = (summary && summary._auctionTime) || (raw && raw.auctionTime) || null;

    if (dp && rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      dp.value = rawDate;
      dp.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (tp && rawTime && /^\d{2}:\d{2}$/.test(rawTime)) {
      // Only set if the exact value exists in the dropdown
      const match = Array.from(tp.options).find(o => o.value === rawTime);
      if (match) {
        tp.value = rawTime;
        tp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  // ---------- Populate ----------
  function populateSummaryForm(summary, raw) {
    if (!summary) throw new Error('No summary object to populate.');

    Object.entries(FIELD_MAP).forEach(([key, fieldId]) => {
      setValueIfExists(fieldId, summary[key] || '');
    });

    applyBrokerIfDetected(summary, raw);
    applyDateTimeIfDetected(summary, raw);
    return true;
  }

  // ---------- Parse + transform ----------
  function requireFns() {
    if (typeof window.AI_transformToSummary !== 'function') {
      throw new Error('AI_transformToSummary is not loaded.');
    }
    const parser = window.AI_parseListingSource || window.AI_parseListingText;
    if (typeof parser !== 'function') {
      throw new Error('Listing parser is not loaded.');
    }
    return { parser, transformer: window.AI_transformToSummary };
  }

  function parseAndTransform(source, sourceUrl) {
    const { parser, transformer } = requireFns();
    const raw = parser(source || '', { sourceUrl: sourceUrl || null }) || {};
    const summary = transformer(raw);
    if (!summary) throw new Error('Transform returned no summary.');
    return { raw, summary };
  }

  // ---------- URL flow ----------
  async function runGenerateFromUrl() {
    const url = valueOf('listing-url');
    if (!url) {
      setStatus('Please paste an AuctionInc listing URL first.', 'warning');
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
        const reason = fetched && fetched.reason ? ' ' + fetched.reason : '';
        setStatus(
          'Could not fetch the page.' + reason +
          ' Paste page source or visible listing text into the box on the right, then click Generate from Source.',
          'warning'
        );
        return;
      }

      setStatus('Page fetched (' + fetched.proxyUsed + '). Extracting…', 'info');

      const { raw, summary } = parseAndTransform(fetched.html, url);
      if (!summary._sourceUrl) summary._sourceUrl = url;
      if (!raw.sourceUrl) raw.sourceUrl = url;

      populateSummaryForm(summary, raw);
      setStatus('Form populated from listing. Review & tweak, then export.', 'success');
    } catch (err) {
      console.error(err);
      setStatus('URL generation failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      setBusy(false);
    }
  }

  // ---------- Source/text flow ----------
  async function runGenerateFromSource() {
    const source = valueOf('listing-text');
    const urlHint = valueOf('listing-url');

    if (!source) {
      setStatus('Paste listing page source or visible listing text first.', 'warning');
      return;
    }

    setBusy(true);
    setStatus('Extracting from pasted source…', 'info');

    try {
      const { raw, summary } = parseAndTransform(source, urlHint || null);
      if (urlHint && !summary._sourceUrl) summary._sourceUrl = urlHint;
      if (urlHint && !raw.sourceUrl) raw.sourceUrl = urlHint;

      populateSummaryForm(summary, raw);
      setStatus('Form populated from pasted source. Review & tweak, then export.', 'success');
    } catch (err) {
      console.error(err);
      setStatus('Source generation failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      setBusy(false);
    }
  }

  // ---------- Clear ----------
  function runClear() {
    const ta = $('listing-text');
    if (ta) ta.value = '';
    setStatus('', null);
  }

  // ---------- Wire ----------
  function wireUi() {
    const fetchBtn = $('btn-fetch-url');
    if (fetchBtn) fetchBtn.addEventListener('click', (e) => { e.preventDefault(); runGenerateFromUrl(); });

    const extractBtn = $('btn-extract');
    if (extractBtn) extractBtn.addEventListener('click', (e) => { e.preventDefault(); runGenerateFromSource(); });

    const clearBtn = $('btn-extract-clear');
    if (clearBtn) clearBtn.addEventListener('click', (e) => { e.preventDefault(); runClear(); });

    // Enter in URL field triggers fetch
    const urlInput = $('listing-url');
    if (urlInput) {
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runGenerateFromUrl(); }
      });
    }

    // Ctrl/Cmd+Enter in textarea triggers source parse
    const sourceBox = $('listing-text');
    if (sourceBox) {
      sourceBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          runGenerateFromSource();
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', wireUi);

  // Public for debugging
  window.AI_runGenerateFromUrl = runGenerateFromUrl;
  window.AI_runGenerateFromSource = runGenerateFromSource;
  window.AI_populateSummaryForm = populateSummaryForm;
})();
