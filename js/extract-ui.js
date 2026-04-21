// =====================
// EXTRACT UI WIRING
// =====================
// Hooks the "Paste Listing" card up to the extractor + transformer,
// then populates the existing form fields. Does NOT touch:
//   - Address field
//   - Property image upload
//   - Date/time
//   - Export pipeline
// Runs after DOMContentLoaded.

(function () {
  'use strict';

  function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    // Only overwrite if we have a non-empty value
    if (value === undefined || value === null || value === '') return;
    el.value = String(value);
  }

  function setStatus(msg, level) {
    const el = document.getElementById('extract-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = level || '';
  }

  function setBrokerBadge(inferredName) {
    const el = document.getElementById('broker-inferred-badge');
    if (!el) return;
    if (inferredName) {
      el.textContent = 'INFERRED: ' + inferredName;
      el.className = 'broker-inferred-pill';
    } else {
      el.textContent = '';
      el.className = '';
    }
  }

  function handleExtract() {
    const textarea = document.getElementById('listing-text');
    if (!textarea) return;
    const text = (textarea.value || '').trim();

    if (!text) {
      setStatus('Paste listing text first.', 'warning');
      return;
    }

    // Safety checks: required globals must be loaded
    if (typeof window.AI_parseListingText !== 'function') {
      setStatus('Extractor not loaded.', 'error');
      return;
    }
    if (typeof window.AI_transformToSummary !== 'function') {
      setStatus('Transformer not loaded.', 'error');
      return;
    }

    let raw, summary;
    try {
      raw = window.AI_parseListingText(text);
      summary = window.AI_transformToSummary(raw);
    } catch (err) {
      console.error('[extract-ui] parse/transform error:', err);
      setStatus('Extraction failed: ' + (err && err.message ? err.message : err), 'error');
      return;
    }

    if (!summary) {
      setStatus('Could not extract structured data from the pasted text.', 'error');
      return;
    }

    // Populate form fields. Address is intentionally skipped.
    setFieldValue('headline',     summary.headline);
    setFieldValue('subheadline',  summary.subheadline);
    setFieldValue('subheadline2', summary.subheadline2);
    setFieldValue('city',         summary.city);
    setFieldValue('suburb',       summary.suburb);
    setFieldValue('tag1',         summary.tag1);
    setFieldValue('tag2',         summary.tag2);
    setFieldValue('feat1',        summary.feat1);
    setFieldValue('feat2',        summary.feat2);
    setFieldValue('feat3',        summary.feat3);
    setFieldValue('erf-size',     summary.erf);
    setFieldValue('gla',          summary.gla);

    // Broker inference (non-destructive — dropdown remains usable)
    let inferredBrokerName = null;
    if (typeof window.AI_inferBroker === 'function' && window.AI_BROKERS) {
      const brokerId = window.AI_inferBroker(text);
      if (brokerId && window.AI_BROKERS[brokerId]) {
        const sel = document.getElementById('broker');
        if (sel) {
          // Only switch dropdown if option exists
          const hasOption = Array.from(sel.options).some(o => o.value === brokerId);
          if (hasOption) {
            sel.value = brokerId;
          }
        }
        inferredBrokerName = window.AI_BROKERS[brokerId].name;
      }
    }
    setBrokerBadge(inferredBrokerName);

    // Build status message
    const missing = [];
    if (!summary.headline)     missing.push('headline');
    if (!summary.feat1)        missing.push('feature 1');
    if (!summary.feat2)        missing.push('feature 2');
    if (!summary.feat3)        missing.push('feature 3');
    if (!summary.city)         missing.push('city');
    if (!summary.suburb)       missing.push('suburb');

    if (missing.length === 0 && inferredBrokerName) {
      setStatus('✓ Extracted successfully. Review and edit fields as needed.', 'success');
    } else if (missing.length === 0) {
      setStatus('✓ Extracted. Broker not detected — please select manually.', 'warning');
    } else {
      setStatus(
        '⚠ Extracted partial data. Missing: ' + missing.join(', ') +
        (inferredBrokerName ? '' : '. Broker not detected.'),
        'warning'
      );
    }
  }

  function handleClear() {
    const textarea = document.getElementById('listing-text');
    if (textarea) textarea.value = '';
    setStatus('', '');
    setBrokerBadge(null);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const btnExtract = document.getElementById('btn-extract');
    const btnClear = document.getElementById('btn-extract-clear');
    if (btnExtract) btnExtract.addEventListener('click', handleExtract);
    if (btnClear) btnClear.addEventListener('click', handleClear);
  });
})();
