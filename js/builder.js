// =====================
// CONFIG
// =====================

// ✅ Red tag nudge (same concept as working system)
const SOCIAL_RED_TAG_NUDGE_X = 30;
const SOCIAL_RED_TAG_NUDGE_Y = 0;
const SOCIAL_RED_TAG_ALPHA = 0.96;

// ✅ Allow BIG uploads (as requested) but we will resize/compress for export stability
const MAX_UPLOAD_MB = 40;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Resize/compress uploaded images so downloads stay small and reliable
const UPLOAD_MAX_W = 2400;
const UPLOAD_MAX_H = 2400;
const UPLOAD_JPEG_QUALITY = 0.90;

// Export settings (keep outputs small like working system)
const EXPORT_SCALE_SOCIAL = 2;
const EXPORT_SCALE_NEWSLETTER = 2;
const EXPORT_SCALE_FLYER = 2;

// =====================
// BROKERS
// =====================
// Prefer the global AI_BROKERS (from js/brokers.js) if available,
// but fall back to a local copy to preserve original working behaviour
// if brokers.js ever fails to load.
const BROKERS = (typeof window !== 'undefined' && window.AI_BROKERS) ? window.AI_BROKERS : {
  "alex-krause": { name: "Alex Krause", phone: "078 549 2029", email: "alex@auctioninc.co.za" },
  "gary-brower": { name: "Gary Brower", phone: "082 352 5552", email: "garyb@auctioninc.co.za" },
  "bongane-khumalo": { name: "Bongane Khumalo", phone: "073 785 5100", email: "bongane@auctioninc.co.za" },
  "cliff-matshatsha": { name: "Cliff Matshatsha", phone: "082 099 8692", email: "cliff@auctioninc.co.za" },
  "daniel-wachenheimer": { name: "Daniel Wachenheimer", phone: "082 740 2856", email: "daniel@auctioninc.co.za" },
  "dean-doucha": { name: "Dean Doucha", phone: "082 374 5565", email: "dean@auctioninc.co.za" },
  "elki-medalie": { name: "Elki Medalie", phone: "083 764 5370", email: "elki@auctioninc.co.za" },
  "doron-sacks": { name: "Doron Sacks", phone: "082 550 7081", email: "doron@auctioninc.co.za" },
  "george-merricks": { name: "George Merricks", phone: "082 859 9303", email: "george@auctioninc.co.za" },
  "gerhard-venter": { name: "Gerhard Venter", phone: "076 905 5519", email: "gerhard@auctioninc.co.za" },
  "jenny-pillay": { name: "Jenny Pillay", phone: "063 959 2260", email: "jenny@auctioninc.co.za" },
  "jessica-beyers-lahner": { name: "Jessica Beyers-Lahner", phone: "072 576 0973", email: "jessica@auctioninc.co.za" },
  "jodi-bedil": { name: "Jodi Bedil", phone: "076 637 1273", email: "jodib@auctioninc.co.za" },
  "jodi-frankel": { name: "Jodi Frankel", phone: "082 441 8409", email: "jodif@auctioninc.co.za" },
  "keith-nkosi": { name: "Keith Nkosi", phone: "081 828 1817", email: "keith@auctioninc.co.za" },
  "luanda-tlhotlhalemaje": { name: "Luanda Tlhotlhalemaje", phone: "071 904 4061", email: "luanda@skyriseproperties.co.za" },
  "nic-brett": { name: "Nic Brett", phone: "078 330 7523", email: "nic@auctioninc.co.za" },
  "reece-louw": { name: "Reece Louw", phone: "076 393 1131", email: "reece@auctioninc.co.za" },
  "reshma-sookran": { name: "Reshma Sookran", phone: "071 876 6524", email: "reshma@auctioninc.co.za" },
  "shlomo-hecht": { name: "Shlomo Hecht", phone: "073 791 7967", email: "shlomo@auctioninc.co.za" },
  "sim-mthembu": { name: "Sim Mthembu", phone: "063 829 7431", email: "simphiwe@auctioninc.co.za" },
  "stuart-holliman": { name: "Stuart Holliman", phone: "067 373 9239", email: "stuart@auctioninc.co.za" },
  "thabani-ncube": { name: "Thabani Ncube", phone: "071 624 2899", email: "thabani@auctioninc.co.za" },
  "yoni-dadon": { name: "Yoni Dadon", phone: "061 822 6128", email: "yoni@auctioninc.co.za" }
};

// =====================
// STAGE 1 — Export lock (prevents double-click race conditions)
// =====================
let __isExporting = false;

function __setAllDownloadButtonsDisabled(disabled) {
  // Only disable buttons that trigger exports. We target by onclick substring
  // to avoid disabling unrelated UI (e.g. "Extract & Populate").
  const all = document.querySelectorAll('button[type="button"]');
  all.forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    if (oc.indexOf('generateAndDownload') !== -1 || oc.indexOf('downloadWordDoc') !== -1) {
      b.disabled = !!disabled;
      b.style.opacity = disabled ? '0.6' : '';
      b.style.cursor = disabled ? 'wait' : '';
    }
  });
}

// =====================
// Helpers
// =====================
function formatDate(dateString, timeString) {
  if (!dateString || !timeString) return '';
  const date = new Date(`${dateString}T${timeString}`);
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return `${date.toLocaleDateString('en-ZA', options)} @ ${timeString}`;
}

async function waitForElement(selector, root = document, timeout = 4000) {
  const start = Date.now();
  while (!root.querySelector(selector)) {
    await new Promise(r => requestAnimationFrame(r));
    if (Date.now() - start > timeout) return null;
  }
  return root.querySelector(selector);
}

function waitForImagesToLoad(container) {
  const images = container.querySelectorAll('img');
  const promises = Array.from(images).map(img =>
    new Promise(resolve => {
      if (img.complete) return resolve();
      img.onload = img.onerror = resolve;
    })
  );
  return Promise.all(promises);
}

function waitForRenderFrames(frames = 3) {
  return new Promise(resolve => {
    const step = () => {
      if (frames-- <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ✅ GitHub Pages safe URL builder
function absUrl(relativePath) {
  return new URL(relativePath, window.location.href).toString();
}

// =====================
// Broker helpers
// =====================
function getSelectedBroker() {
  const brokerEl = document.getElementById("broker");
  const brokerId = (brokerEl && brokerEl.value) ? brokerEl.value : "alex-krause";
  const broker = BROKERS[brokerId] || BROKERS["alex-krause"];
  return { brokerId, broker };
}

function setImgWithFallback(imgEl, primarySrc, fallbackSrc) {
  if (!imgEl) return;
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = fallbackSrc;
  };
  imgEl.src = primarySrc;
}

function applyBrokerToTemplate(target, templatePath, brokerId, broker) {
  // NEWSLETTER: swap broker photo + contact details
  if (templatePath.includes("newsletter")) {
    const contact = target.querySelector(".textbox_Contact_Details");
    if (contact) {
      contact.innerHTML = `
        <span>${(broker.name || "").toUpperCase()}</span>
        <span>${broker.phone || ""}</span>
        <span>${broker.email || ""}</span>
      `;
    }

    const brokerPhoto = target.querySelector(".overlay-image_Broker_Photo");
    setImgWithFallback(
      brokerPhoto,
      absUrl(`assets/brokers/${brokerId}/broker-photo.png`),
      absUrl("assets/broker-photo.png")
    );
  }

  // FLYER: swap broker-phone image
  if (templatePath.includes("flyer_multi")) {
    const brokerPhone = target.querySelector(".overlay-image_broker-phone");
    setImgWithFallback(
      brokerPhone,
      absUrl(`assets/brokers/${brokerId}/broker-phone.png`),
      absUrl("assets/broker-phone.png")
    );
  }
}

// =====================
// Image handling (BIG upload allowed, but RESIZED for stability)
// =====================
function getImageDataUrl(inputId, maxW = UPLOAD_MAX_W, maxH = UPLOAD_MAX_H, quality = UPLOAD_JPEG_QUALITY) {
  return new Promise((resolve) => {
    const input = document.getElementById(inputId);
    const file = (input && input.files && input.files[0]) ? input.files[0] : null;
    if (!file) return resolve('');

    if (file.size > MAX_UPLOAD_BYTES) {
      alert(`⚠️ Please upload an image under ${MAX_UPLOAD_MB}MB.`);
      return resolve('');
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;

        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        // ✅ Always output as jpeg dataURL for smaller in-memory footprint
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(reader.result || '');
      img.src = reader.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

// =====================
// Font resize
// =====================
function adjustFontSize(textbox) {
  const span = textbox.querySelector('span');
  if (!span) return;

  const text = span.innerText;
  const maxWidth = textbox.offsetWidth - 20;
  const maxHeight = textbox.offsetHeight - 20;
  let fontSize = 200;

  const dummy = document.createElement('span');
  dummy.style.visibility = 'hidden';
  dummy.style.position = 'absolute';
  dummy.style.fontFamily = 'Roboto, sans-serif';
  dummy.style.fontSize = fontSize + 'px';
  dummy.innerText = text;
  document.body.appendChild(dummy);

  while (fontSize > 5 && (dummy.offsetWidth > maxWidth || dummy.offsetHeight > maxHeight)) {
    fontSize--;
    dummy.style.fontSize = fontSize + 'px';
  }

  span.style.fontSize = fontSize + 'px';
  document.body.removeChild(dummy);
}

function runFontResize(container, templateId) {
  let ids = [];

  if (templateId.includes('social')) {
    ids = ['textbox_1_Red_Tag', 'textbox_2_Red_Tag', 'textbox_Red_Rectangle', 'textbox_Header_2'];
  } else if (templateId.includes('newsletter')) {
    ids = ['textbox_1_Red_Tag', 'textbox_2_Red_Tag', 'textbox_Property_Heading'];
  } else if (templateId.includes('flyer')) {
    ids = [
      'textbox_1_Red_Banner', 'textbox_2_Red_Banner',
      'textbox_Feature_1', 'textbox_Feature_2', 'textbox_Feature_3',
      'textbox_1_Blue_Overlay', 'textbox_2_Blue_Overlay', 'textbox_3_Blue_Overlay',
      'DATE', 'ADDRESS'
    ];
  } else if (templateId.includes('erf')) {
    ids = ['textbox_1_Red_Tag', 'textbox_2_Red_Tag', 'textbox_Red_Rectangle', 'textbox_Header_2', 'textbox_Point'];
  } else if (templateId.includes('gla')) {
    ids = ['textbox_1_Red_Tag', 'textbox_2_Red_Tag', 'textbox_Red_Rectangle', 'textbox_Header_2', 'textbox_Point'];
  } else if (templateId.includes('dual')) {
    ids = ['textbox_1_Red_Tag', 'textbox_2_Red_Tag', 'textbox_Red_Rectangle', 'textbox_Header_2', 'textbox_Point_1', 'textbox_Point_2'];
  }

  ids.forEach(id => {
    const el = container.querySelector(`#${id}`);
    if (el && el.querySelector('span')) adjustFontSize(el);
  });
}

// =====================
// Collect form data
// =====================
async function collectFormData() {
  const { brokerId, broker } = getSelectedBroker();

  const getVal = (id) => {
    const el = document.getElementById(id);
    return el && typeof el.value === 'string' ? el.value : '';
  };

  return {
    brokerId,
    brokerName: broker.name || "",
    brokerPhone: broker.phone || "",
    brokerEmail: broker.email || "",

    headline: getVal('headline'),
    subheadline: getVal('subheadline'),
    subheadline2: getVal('subheadline2'),
    city: getVal('city'),
    suburb: getVal('suburb'),
    tag1: getVal('tag1'),
    tag2: getVal('tag2'),
    date: formatDate(getVal('date-picker'), getVal('time-picker')),
    time: getVal('time-picker'),
    address: getVal('address'),
    feat1: getVal('feat1'),
    feat2: getVal('feat2'),
    feat3: getVal('feat3'),
    erf: getVal('erf-size'),
    gla: getVal('gla'),
    propertyImage: await getImageDataUrl('property-img')
  };
}

// =====================
// Canvas draws (PROMISES so export waits correctly)
// =====================
function drawFlyerCanvasImage(imageDataUrl, target) {
  return new Promise((resolve) => {
    const canvas = target.querySelector('#flyer-property-canvas');
    if (!canvas || !imageDataUrl) return resolve();

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = imageDataUrl;
  });
}

function drawNewsletterCanvasImage(imageDataUrl, target) {
  return new Promise((resolve) => {
    const canvas = target.querySelector('#property-canvas');
    if (!canvas || !imageDataUrl) return resolve();

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
      const x = (canvas.width - img.width * scale) / 2;
      const y = (canvas.height - img.height * scale) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = imageDataUrl;
  });
}

function drawSocialCanvasImage(imageDataUrl, target) {
  return new Promise((resolve) => {
    const canvas = target.querySelector('#social-property-canvas');
    if (!canvas || !imageDataUrl) return resolve();

    const ctx = canvas.getContext('2d');

    const propertyImg = new Image();
    propertyImg.crossOrigin = 'anonymous';

    propertyImg.onload = () => {
      const scale = Math.max(canvas.width / propertyImg.width, canvas.height / propertyImg.height);
      const x = (canvas.width - propertyImg.width * scale) / 2;
      const y = (canvas.height - propertyImg.height * scale) / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(propertyImg, x, y, propertyImg.width * scale, propertyImg.height * scale);

      // ✅ Red tag AFTER photo
      const redTag = new Image();
      redTag.crossOrigin = 'anonymous';

      redTag.onload = () => {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = SOCIAL_RED_TAG_ALPHA;

        // map based on 1130-wide area (same as working)
        const scaleFactor = canvas.width / 1130;

        const redTagWidth = 490 * scaleFactor;
        const redTagHeight = 462 * scaleFactor;

        const redTagX = ((718 - 40) + SOCIAL_RED_TAG_NUDGE_X) * scaleFactor;
        const redTagY = (0 + SOCIAL_RED_TAG_NUDGE_Y) * scaleFactor;

        ctx.drawImage(redTag, redTagX, redTagY, redTagWidth, redTagHeight);
        ctx.restore();

        resolve();
      };

      redTag.onerror = () => resolve();
      redTag.src = absUrl('assets/red-tag.png');
    };

    propertyImg.onerror = () => resolve();
    propertyImg.src = imageDataUrl;
  });
}

// =====================
// Template load + populate (GitHub safe + waits)
// =====================
async function loadTemplate(templatePath, targetId, data) {
  const res = await fetch(absUrl(templatePath), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load template: ${templatePath} (${res.status})`);

  let html = await res.text();
  for (const key in data) {
    html = html.replaceAll(`{{${key}}}`, data[key] != null ? data[key] : '');
  }

  const target = document.getElementById(targetId);
  if (!target) throw new Error(`Target not found: ${targetId}`);

  target.innerHTML = html;

  // ✅ Apply broker swaps before image waits and html2canvas
  applyBrokerToTemplate(
    target,
    templatePath,
    data.brokerId,
    { name: data.brokerName, phone: data.brokerPhone, email: data.brokerEmail }
  );

  await waitForImagesToLoad(target);

  // ✅ Wait for canvas draws to finish
  if (templatePath.includes('newsletter')) {
    await drawNewsletterCanvasImage(data.propertyImage, target);
  } else if (
    templatePath.includes('social') ||
    templatePath.includes('social_erf') ||
    templatePath.includes('social_gla') ||
    templatePath.includes('social_2')
  ) {
    await drawSocialCanvasImage(data.propertyImage, target);
  } else if (templatePath.includes('flyer_multi')) {
    await drawFlyerCanvasImage(data.propertyImage, target);
  }

  // ✅ pick correct container selector
  let containerSelector = '[id^="capture-container"]';
  if (templatePath.includes('social_erf')) containerSelector = '#capture-container-erf';
  else if (templatePath.includes('social_gla')) containerSelector = '#capture-container-gla';
  else if (templatePath.includes('social_2')) containerSelector = '#capture-container-dual';

  const container = await waitForElement(containerSelector, target, 5000);
  if (container) runFontResize(container, targetId);

  await waitForRenderFrames(3);
}

// =====================
// UI actions
// =====================
async function generateAndDownload(template) {
  // ✅ STAGE 1: export lock — ignore re-entrant clicks
  if (__isExporting) {
    console.warn('[AuctionInc] Export already in progress — ignoring click.');
    return;
  }
  __isExporting = true;
  __setAllDownloadButtonsDisabled(true);

  try {
    const data = await collectFormData();

    // ✅ Choose small/appropriate formats like the working system
    const map = {
      social:          { path: 'templates/social.html',        target: 'social-preview',       filename: 'social.jpg',          mime: 'image/jpeg' },
      commercial_erf:  { path: 'templates/social_erf.html',    target: 'erf-preview',          filename: 'commercial_erf.jpg',  mime: 'image/jpeg' },
      commercial_gla:  { path: 'templates/social_gla.html',    target: 'gla-preview',          filename: 'commercial_gla.jpg',  mime: 'image/jpeg' },
      commercial_dual: { path: 'templates/social_2.html',      target: 'dual-preview',         filename: 'commercial_dual.jpg', mime: 'image/jpeg' },
      newsletter:      { path: 'templates/newsletter.html',    target: 'newsletter-preview',   filename: 'newsletter.png',      mime: 'image/png' },
      multi_flyer:     { path: 'templates/flyer_multi.html',   target: 'multi-flyer-preview',  filename: 'multi-flyer.jpg',     mime: 'image/jpeg' }
    };

    const cfg = map[template];
    if (!cfg) throw new Error(`Unknown template: ${template}`);

    const { path, target, filename, mime } = cfg;

    const previewWrapper = document.getElementById(target);
    if (!previewWrapper) throw new Error(`Preview wrapper not found: ${target}`);

    await loadTemplate(path, target, data);

    // find correct container
    let containerSelector = '[id^="capture-container"]';
    if (template === 'commercial_erf') containerSelector = '#capture-container-erf';
    else if (template === 'commercial_gla') containerSelector = '#capture-container-gla';
    else if (template === 'commercial_dual') containerSelector = '#capture-container-dual';

    const container = await waitForElement(containerSelector, previewWrapper, 7000);
    if (!container) throw new Error("Template container not found.");
    if (container.offsetWidth === 0 || container.offsetHeight === 0) throw new Error("Template container not rendered.");

    // ensure visible for capture
    container.style.display = 'block';
    container.style.visibility = 'visible';
    container.style.opacity = 1;
    container.style.pointerEvents = 'auto';
    container.style.position = 'static';

    await waitForImagesToLoad(container);
    await waitForRenderFrames(4);

    const scale =
      template === 'newsletter' ? EXPORT_SCALE_NEWSLETTER :
      template === 'multi_flyer' ? EXPORT_SCALE_FLYER :
      EXPORT_SCALE_SOCIAL;

    const canvas = await html2canvas(container, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff"
    });

    // Use a promise so we can release the export lock AFTER the blob is saved
    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          alert("❌ Export failed (blob was null).");
          resolve();
          return;
        }

        const link = document.createElement("a");
        link.download = filename;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);

        // hide after capture (preserve legacy behaviour)
        container.style.display = 'none';
        container.style.position = 'absolute';
        container.style.opacity = 0;
        container.style.pointerEvents = 'none';

        resolve();
      }, mime, mime === "image/jpeg" ? 0.92 : undefined);
    });

  } catch (err) {
    console.error(err);
    alert("❌ Design export failed: " + (err && err.message ? err.message : err));
  } finally {
    __isExporting = false;
    __setAllDownloadButtonsDisabled(false);
  }
}

// =====================
// Word Summary (canonical AuctionInc format — UNCHANGED)
// =====================
async function downloadWordDoc() {
  // ✅ STAGE 1: export lock also applies to Word export
  if (__isExporting) {
    console.warn('[AuctionInc] Export already in progress — ignoring click.');
    return;
  }
  __isExporting = true;
  __setAllDownloadButtonsDisabled(true);

  try {
    if (!window.docx) {
      alert("❌ Word export library (docx) not loaded.");
      return;
    }

    const { Document, Packer, Paragraph, TextRun } = window.docx;
    const { broker } = getSelectedBroker();

    const datePickerEl = document.getElementById("date-picker");
    const timePickerEl = document.getElementById("time-picker");
    let rawDate = (datePickerEl && datePickerEl.value) ? datePickerEl.value : "";
    const rawTime = (timePickerEl && timePickerEl.value) ? timePickerEl.value : "00:00";

    if (!rawDate) {
      const d = new Date();
      rawDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }

    const fullDateObj = new Date(`${rawDate}T${rawTime}`);
    const formattedDate = fullDateObj.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const fullDateTime = `${formattedDate} @ ${rawTime}`;

    const getVal = (id) => {
      const el = document.getElementById(id);
      return el && typeof el.value === 'string' ? el.value : '';
    };

    const fields = {
      "Broker": `${broker.name || ''} | ${broker.phone || ''} | ${broker.email || ''}`,
      "Headline": getVal("headline"),
      "City": getVal("city"),
      "Suburb": getVal("suburb"),
      "Tagline 1": getVal("tag1"),
      "Tagline 2": getVal("tag2"),
      "Date & Time": fullDateTime,
      "Feature 1": getVal("feat1"),
      "Feature 2": getVal("feat2"),
      "Feature 3": getVal("feat3")
    };

    const erf = getVal("erf-size").trim();
    const gla = getVal("gla").trim();
    if (gla) fields["GLA"] = gla;
    if (erf) fields["ERF Size"] = erf;

    const paragraphs = Object.entries(fields).map(([label, value]) =>
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: label + ": ", bold: true, size: 28, font: "Roboto" }),
          new TextRun({ text: String(value), size: 24, font: "Roboto" })
        ]
      })
    );

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AuctionInc_Property_Summary.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("❌ Word export failed: " + (err && err.message ? err.message : err));
  } finally {
    __isExporting = false;
    __setAllDownloadButtonsDisabled(false);
  }
}

// =====================
// Minor UX tweaks (date defaults to today)
// =====================
function setDatePickerToToday() {
  const dp = document.getElementById("date-picker");
  if (!dp) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;

  if (!dp.value) dp.value = iso;
}

document.addEventListener("DOMContentLoaded", () => {
  setDatePickerToToday();
});

// =====================
// Export for HTML onclick="..."
// =====================
window.generateAndDownload = generateAndDownload;
window.downloadWordDoc = downloadWordDoc;
