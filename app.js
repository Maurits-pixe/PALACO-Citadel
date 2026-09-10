(() => {
  const STORAGE_KEY = "palaco.lang";
  const order = ["en", "nl", "eo"];
  const text = {
    en: {
      title: "PALACO Citadel",
      subtitle: "Canonical gateway and structured source map.",
      quickLinks: "Quick links",
      linkCanonMap: "CANON map",
      linkChecklist: "Big Bang baseline checklist",
      linkBigBang: "Big Bang source file",
      statusReady: "Ready.",
      toggle: "Language: English"
    },
    nl: {
      title: "PALACO Citadel",
      subtitle: "Canonieke toegang en gestructureerde bronnenkaart.",
      quickLinks: "Snelle links",
      linkCanonMap: "CANON map",
      linkChecklist: "Big Bang baseline checklist",
      linkBigBang: "Big Bang bronbestand",
      statusReady: "Klaar.",
      toggle: "Taal: Nederlands"
    },
    eo: {
      title: "PALACO Citadel",
      subtitle: "Kanona enirejo kaj strukturita fontomapo.",
      quickLinks: "Rapidaj ligiloj",
      linkCanonMap: "CANON mapo",
      linkChecklist: "Big Bang baza kontrollisto",
      linkBigBang: "Big Bang fontdosiero",
      statusReady: "Preta.",
      toggle: "Lingvo: Esperanto"
    }
  };

  const initial = localStorage.getItem(STORAGE_KEY);
  let lang = order.includes(initial) ? initial : "en";

  const apply = () => {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key && text[lang][key]) el.textContent = text[lang][key];
    });
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.textContent = text[lang].toggle;
    localStorage.setItem(STORAGE_KEY, lang);
  };

  const toggle = document.getElementById("lang-toggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      lang = order[(order.indexOf(lang) + 1) % order.length];
      apply();
    });
  }

  apply();
})();
