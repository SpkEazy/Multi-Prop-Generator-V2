// =====================
// BROKERS REGISTRY + INFERENCE
// =====================
// Single source of truth for broker data.
// Used by builder.js (fallback) and extractor.js (inference).
//
// window.AI_BROKERS  : { brokerId: { name, phone, email } }
// window.AI_inferBroker(haystackText) -> brokerId | null

(function () {
  'use strict';

  const BROKERS = {
    "alex-krause":          { name: "Alex Krause",          phone: "078 549 2029", email: "alex@auctioninc.co.za" },
    "gary-brower":          { name: "Gary Brower",          phone: "082 352 5552", email: "garyb@auctioninc.co.za" },
    "bongane-khumalo":      { name: "Bongane Khumalo",      phone: "073 785 5100", email: "bongane@auctioninc.co.za" },
    "cliff-matshatsha":     { name: "Cliff Matshatsha",     phone: "082 099 8692", email: "cliff@auctioninc.co.za" },
    "daniel-wachenheimer":  { name: "Daniel Wachenheimer",  phone: "082 740 2856", email: "daniel@auctioninc.co.za" },
    "dean-doucha":          { name: "Dean Doucha",          phone: "082 374 5565", email: "dean@auctioninc.co.za" },
    "elki-medalie":         { name: "Elki Medalie",         phone: "083 764 5370", email: "elki@auctioninc.co.za" },
    "doron-sacks":          { name: "Doron Sacks",          phone: "082 550 7081", email: "doron@auctioninc.co.za" },
    "george-merricks":      { name: "George Merricks",      phone: "082 859 9303", email: "george@auctioninc.co.za" },
    "gerhard-venter":       { name: "Gerhard Venter",       phone: "076 905 5519", email: "gerhard@auctioninc.co.za" },
    "jenny-pillay":         { name: "Jenny Pillay",         phone: "063 959 2260", email: "jenny@auctioninc.co.za" },
    "jessica-beyers-lahner":{ name: "Jessica Beyers-Lahner",phone: "072 576 0973", email: "jessica@auctioninc.co.za" },
    "jodi-bedil":           { name: "Jodi Bedil",           phone: "076 637 1273", email: "jodib@auctioninc.co.za" },
    "jodi-frankel":         { name: "Jodi Frankel",         phone: "082 441 8409", email: "jodif@auctioninc.co.za" },
    "keith-nkosi":          { name: "Keith Nkosi",          phone: "081 828 1817", email: "keith@auctioninc.co.za" },
    "luanda-tlhotlhalemaje":{ name: "Luanda Tlhotlhalemaje",phone: "071 904 4061", email: "luanda@skyriseproperties.co.za" },
    "nic-brett":            { name: "Nic Brett",            phone: "078 330 7523", email: "nic@auctioninc.co.za" },
    "reece-louw":           { name: "Reece Louw",           phone: "076 393 1131", email: "reece@auctioninc.co.za" },
    "reshma-sookran":       { name: "Reshma Sookran",       phone: "071 876 6524", email: "reshma@auctioninc.co.za" },
    "shlomo-hecht":         { name: "Shlomo Hecht",         phone: "073 791 7967", email: "shlomo@auctioninc.co.za" },
    "sim-mthembu":          { name: "Sim Mthembu",          phone: "063 829 7431", email: "simphiwe@auctioninc.co.za" },
    "stuart-holliman":      { name: "Stuart Holliman",      phone: "067 373 9239", email: "stuart@auctioninc.co.za" },
    "thabani-ncube":        { name: "Thabani Ncube",        phone: "071 624 2899", email: "thabani@auctioninc.co.za" },
    "yoni-dadon":           { name: "Yoni Dadon",           phone: "061 822 6128", email: "yoni@auctioninc.co.za" }
  };

  function normalisePhone(p) {
    return String(p || '').replace(/[^\d]/g, '');
  }

  function inferBroker(haystack) {
    if (!haystack) return null;
    const text = String(haystack).toLowerCase();
    const digits = normalisePhone(haystack);

    // 1. Email match (strongest)
    for (const [id, b] of Object.entries(BROKERS)) {
      const email = String(b.email || '').toLowerCase();
      if (email && text.indexOf(email) !== -1) return id;
    }

    // 2. Phone match
    for (const [id, b] of Object.entries(BROKERS)) {
      const phoneDigits = normalisePhone(b.phone);
      if (phoneDigits && digits.indexOf(phoneDigits) !== -1) return id;
    }

    // 3. Full name match
    for (const [id, b] of Object.entries(BROKERS)) {
      const name = String(b.name || '').toLowerCase();
      if (name && text.indexOf(name) !== -1) return id;
    }

    return null;
  }

  window.AI_BROKERS = BROKERS;
  window.AI_inferBroker = inferBroker;
})();
