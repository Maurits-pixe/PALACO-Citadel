(() => {
  const STORAGE_KEY = "palaco.lang";
  const order = ["en", "nl", "eo"];
  const text = {
    en: {
      title: "PALACO Citadel",
      subtitle: "Canonical gateway and structured source map.",
      missionTitle: "Mission",
      missionBody: "A single entrypoint for canonical PALACO files, baseline rules, and source navigation.",
      quickLinks: "Canonical links",
      linkCanonMap: "CANON map",
      linkChecklist: "Big Bang baseline checklist",
      linkBigBang: "Big Bang source file",
      hubsTitle: "GitHub hubs",
      hubPalaco: "PALACO repository",
      hubIndustrie: "PALACO-Industrie repository",
      statusReady: "Ready.",
      toggle: "Language: English",
      toggleAria: "Switch language"
    },
    nl: {
      title: "PALACO Citadel",
      subtitle: "Canonieke toegang en gestructureerde bronnenkaart.",
      missionTitle: "Missie",
      missionBody: "Eén toegangspunt voor canonieke PALACO-bestanden, basisregels en bronnavigatie.",
      quickLinks: "Canonieke links",
      linkCanonMap: "CANON map",
      linkChecklist: "Big Bang baseline checklist",
      linkBigBang: "Big Bang bronbestand",
      hubsTitle: "GitHub hubs",
      hubPalaco: "PALACO repository",
      hubIndustrie: "PALACO-Industrie repository",
      statusReady: "Klaar.",
      toggle: "Taal: Nederlands",
      toggleAria: "Wissel taal"
    },
    eo: {
      title: "PALACO Citadel",
      subtitle: "Kanona enirejo kaj strukturita fontomapo.",
      missionTitle: "Misio",
      missionBody: "Unu enirejo por kanonaj PALACO-dosieroj, bazaj reguloj kaj fontnavigado.",
      quickLinks: "Kanonaj ligiloj",
      linkCanonMap: "CANON mapo",
      linkChecklist: "Big Bang baza kontrollisto",
      linkBigBang: "Big Bang fontdosiero",
      hubsTitle: "GitHub centroj",
      hubPalaco: "PALACO deponejo",
      hubIndustrie: "PALACO-Industrie deponejo",
      statusReady: "Preta.",
      toggle: "Lingvo: Esperanto",
      toggleAria: "Ŝanĝi lingvon"
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
    if (btn) {
      btn.textContent = text[lang].toggle;
      btn.setAttribute("aria-label", text[lang].toggleAria);
    }
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

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
