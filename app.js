const form = document.querySelector('#goal-form');
const input = document.querySelector('#goal');
const output = document.querySelector('#goal-output');
const languageButtons = document.querySelectorAll('.lang-btn');
const installBtn = document.querySelector('#install-btn');
const controlButtons = document.querySelectorAll('.control-btn');
const industryStatus = document.querySelector('#industry-status');
const citadelStatus = document.querySelector('#citadel-status');
const syncBtn = document.querySelector('#sync-btn');
const syncOutput = document.querySelector('#sync-output');

const translations = {
  en: {
    eyebrow: 'GO · Scheppen · Create',
    subtitle: 'The first executable UI foundation for desktop, tablet, and mobile.',
    visionTitle: 'Vision',
    visionBody: 'PALACO means “palace” in Esperanto: a shared digital place to build, create, and bring ideas to life.',
    launchTitle: 'Launch Pad',
    goalLabel: 'What will you create today?',
    goalPlaceholder: 'Type your first PALACO goal',
    goButton: 'GO',
    installButton: 'Install app',
    readinessTitle: 'Platform readiness',
    readinessOne: 'Responsive layout for computer, tablet, and mobile.',
    readinessTwo: 'Installable web app foundation (PWA).',
    readinessThree: 'Ready for domain + HTTPS deployment.',
    masterTitle: 'MA5TER Dashboard Control Room',
    masterSubtitle: 'Central command for PALACO Industry and PALACO internal operations.',
    industryTitle: 'PALACO Industry',
    industryBody: 'Monitor and activate industrial production mode.',
    internalTitle: 'PALACO Internal',
    internalBody: 'Manage internal Citadel operation mode.',
    statusLabel: 'Status',
    statusActive: 'Active',
    statusStandby: 'Standby',
    activate: 'Activate',
    deactivate: 'Deactivate',
    syncNow: 'Sync now',
    lastSync: 'Last sync:',
    githubTitle: 'GitHub hubs',
    githubSubtitle: 'Direct access to PALACO and PALACO Industrie on GitHub.',
    githubPalacoTitle: 'PALACO',
    githubPalacoBody: 'Open the PALACO main repository.',
    githubIndustryTitle: 'PALACO Industrie',
    githubIndustryBody: 'Open the PALACO industry repository.',
    rioTitle: 'RIO Platform Ascension',
    rioSubtitle: 'RIO evolves from chat interface to PALACO conversation and communication platform.',
    rioPillarOneTitle: 'Surface-independent conversation',
    rioPillarOneA: 'One conversation identity across mobile, web, Citadel, ELIXER, and desktop.',
    rioPillarOneB: 'Conversation belongs to PALACO context, not to one device.',
    rioPillarOneC: 'Cross-surface continuity remains active through sync and reconnect states.',
    rioPillarTwoTitle: 'Presence with boundaries',
    rioPillarTwoA: 'Presence means reachable, never automatic authority.',
    rioPillarTwoB: 'Online ≠ authorized; constitutional gates remain separate.',
    rioPillarTwoC: 'RIO connects communication while PALACO protects authority boundaries.',
    rioPillarThreeTitle: 'Provenance-aware communication',
    rioPillarThreeA: 'Messages preserve identity, context, origin, time, and traceability.',
    rioPillarThreeB: 'WATERMERK and HOLOGRAM support authenticity and lineage visibility.',
    rioPillarThreeC: 'Complexity is hidden when irrelevant and revealed when material.',
    rioLaw: 'Canonical law: RIO may connect communication; RIO shall not create authority.',
    footer: 'PALACO · Build conditions. Make it count.',
    goalSet: 'PALACO objective set:',
    latestGoal: 'Latest objective:'
  },
  nl: {
    eyebrow: 'GO · Scheppen · Creëren',
    subtitle: 'De eerste uitvoerbare UI-basis voor desktop, tablet en mobiel.',
    visionTitle: 'Visie',
    visionBody: 'PALACO betekent “paleis” in Esperanto: een gedeelde digitale plek om te bouwen, te creëren en ideeën tot leven te brengen.',
    launchTitle: 'Startplatform',
    goalLabel: 'Wat ga jij vandaag creëren?',
    goalPlaceholder: 'Typ je eerste PALACO-doel',
    goButton: 'GO',
    installButton: 'Installeer app',
    readinessTitle: 'Platformgereedheid',
    readinessOne: 'Responsive lay-out voor computer, tablet en mobiel.',
    readinessTwo: 'Installeerbare webapp-basis (PWA).',
    readinessThree: 'Klaar voor domein + HTTPS uitrol.',
    masterTitle: 'MA5TER Dashboard Controlekamer',
    masterSubtitle: 'Centraal commando voor PALACO Industrie en PALACO interne operaties.',
    industryTitle: 'PALACO Industrie',
    industryBody: 'Monitor en activeer industriële productiemodus.',
    internalTitle: 'PALACO Intern',
    internalBody: 'Beheer interne Citadel-operatiemodus.',
    statusLabel: 'Status',
    statusActive: 'Actief',
    statusStandby: 'Stand-by',
    activate: 'Activeren',
    deactivate: 'Deactiveren',
    syncNow: 'Nu synchroniseren',
    lastSync: 'Laatste sync:',
    githubTitle: 'GitHub hubs',
    githubSubtitle: 'Directe toegang tot PALACO en PALACO Industrie op GitHub.',
    githubPalacoTitle: 'PALACO',
    githubPalacoBody: 'Open de hoofdrepository van PALACO.',
    githubIndustryTitle: 'PALACO Industrie',
    githubIndustryBody: 'Open de industriële repository van PALACO.',
    rioTitle: 'RIO Platform Ascension',
    rioSubtitle: 'RIO groeit van chat-interface naar PALACO conversatie- en communicatieplatform.',
    rioPillarOneTitle: 'Surface-onafhankelijke conversatie',
    rioPillarOneA: 'Eén conversatie-identiteit over mobiel, web, Citadel, ELIXER en desktop.',
    rioPillarOneB: 'De conversatie hoort bij PALACO-context, niet bij één apparaat.',
    rioPillarOneC: 'Cross-surface continuïteit blijft bestaan via sync- en reconnect-staten.',
    rioPillarTwoTitle: 'Presence met grenzen',
    rioPillarTwoA: 'Presence betekent bereikbaar, nooit automatische authority.',
    rioPillarTwoB: 'Online ≠ bevoegd; constitutionele poorten blijven gescheiden.',
    rioPillarTwoC: 'RIO verbindt communicatie terwijl PALACO de authority-grenzen bewaakt.',
    rioPillarThreeTitle: 'Provenance-bewuste communicatie',
    rioPillarThreeA: 'Berichten behouden identiteit, context, herkomst, tijd en traceerbaarheid.',
    rioPillarThreeB: 'WATERMERK en HOLOGRAM ondersteunen authenticiteit en lineage-zichtbaarheid.',
    rioPillarThreeC: 'Complexiteit wordt verborgen wanneer irrelevant en getoond wanneer materieel.',
    rioLaw: 'Canonieke wet: RIO mag communicatie verbinden; RIO mag geen authority creëren.',
    footer: 'PALACO · Bouw de voorwaarden. Maak het groots.',
    goalSet: 'PALACO-doel gezet:',
    latestGoal: 'Laatste doel:'
  },
  eo: {
    eyebrow: 'GO · Krei · Estigi',
    subtitle: 'La unua plenumebla UI-bazo por komputilo, tablojdo kaj poŝtelefono.',
    visionTitle: 'Vizio',
    visionBody: 'PALACO signifas “palaco” en Esperanto: komuna cifereca loko por konstrui, krei kaj vivigi ideojn.',
    launchTitle: 'Lanĉejo',
    goalLabel: 'Kion vi kreos hodiaŭ?',
    goalPlaceholder: 'Tajpu vian unuan PALACO-celon',
    goButton: 'GO',
    installButton: 'Instalu apon',
    readinessTitle: 'Platforma preteco',
    readinessOne: 'Respondema aranĝo por komputilo, tablojdo kaj poŝtelefono.',
    readinessTwo: 'Instalebla ret-apo bazo (PWA).',
    readinessThree: 'Preta por domajno + HTTPS publikigo.',
    masterTitle: 'MA5TER Panela Kontrolĉambro',
    masterSubtitle: 'Centra komando por PALACO-Industrio kaj internaj PALACO-operacioj.',
    industryTitle: 'PALACO Industrio',
    industryBody: 'Monitoru kaj aktivigu industrian produktadan reĝimon.',
    internalTitle: 'PALACO Interna',
    internalBody: 'Administru internan Citadel-operacian reĝimon.',
    statusLabel: 'Stato',
    statusActive: 'Aktiva',
    statusStandby: 'Atenda',
    activate: 'Aktivigi',
    deactivate: 'Malaktivigi',
    syncNow: 'Sinkronigi nun',
    lastSync: 'Lasta sinkronigo:',
    githubTitle: 'GitHub nodoj',
    githubSubtitle: 'Rekta aliro al PALACO kaj PALACO Industrie en GitHub.',
    githubPalacoTitle: 'PALACO',
    githubPalacoBody: 'Malfermu la ĉefan deponejon de PALACO.',
    githubIndustryTitle: 'PALACO Industrie',
    githubIndustryBody: 'Malfermu la industrian deponejon de PALACO.',
    rioTitle: 'RIO Platform Ascension',
    rioSubtitle: 'RIO evoluas de babila interfaco al konversacia kaj komunikada platformo de PALACO.',
    rioPillarOneTitle: 'Surfaco-sendependa konversacio',
    rioPillarOneA: 'Unu konversacia identeco tra poŝtelefono, reto, Citadel, ELIXER kaj labortablo.',
    rioPillarOneB: 'La konversacio apartenas al PALACO-kunteksto, ne al unu aparato.',
    rioPillarOneC: 'Trans-surfaca kontinueco restas aktiva per sinkronigo kaj rekonekto-statoj.',
    rioPillarTwoTitle: 'Ĉeesto kun limoj',
    rioPillarTwoA: 'Ĉeesto signifas atingebla, neniam aŭtomata aŭtoritato.',
    rioPillarTwoB: 'Rete ≠ rajtigita; konstituciaj pordegoj restas apartaj.',
    rioPillarTwoC: 'RIO ligas komunikadon dum PALACO protektas aŭtoritatajn limojn.',
    rioPillarThreeTitle: 'Provenienco-konscia komunikado',
    rioPillarThreeA: 'Mesaĝoj konservas identecon, kuntekston, originon, tempon kaj spureblecon.',
    rioPillarThreeB: 'WATERMERK kaj HOLOGRAM subtenas aŭtentikecon kaj videblecon de devenlinio.',
    rioPillarThreeC: 'Komplekseco kaŝiĝas kiam negrava kaj montriĝas kiam materia.',
    rioLaw: 'Kanona leĝo: RIO rajtas ligi komunikadon; RIO ne rajtas krei aŭtoritaton.',
    footer: 'PALACO · Konstruu la kondiĉojn. Faru ĝin grava.',
    goalSet: 'PALACO-celo agordita:',
    latestGoal: 'Plej lasta celo:'
  }
};

let currentLanguage = localStorage.getItem('palaco-language') || 'en';
const controlState = JSON.parse(localStorage.getItem('palaco-control-state') || '{"industry":false,"citadel":false}');

const saveControlState = () => {
  localStorage.setItem('palaco-control-state', JSON.stringify(controlState));
};

const getLocale = () => {
  if (currentLanguage === 'nl') return 'nl-NL';
  if (currentLanguage === 'eo') return 'eo';
  return 'en-US';
};

const updateSyncOutput = () => {
  const lastSync = localStorage.getItem('palaco-last-sync');
  if (!syncOutput) return;
  if (!lastSync) {
    syncOutput.textContent = '';
    return;
  }

  const formatter = new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  syncOutput.textContent = `${translations[currentLanguage].lastSync} ${formatter.format(new Date(lastSync))}`;
};

const updateControlUI = () => {
  if (industryStatus) {
    industryStatus.textContent = controlState.industry
      ? translations[currentLanguage].statusActive
      : translations[currentLanguage].statusStandby;
  }

  if (citadelStatus) {
    citadelStatus.textContent = controlState.citadel
      ? translations[currentLanguage].statusActive
      : translations[currentLanguage].statusStandby;
  }

  controlButtons.forEach((button) => {
    const target = button.dataset.controlTarget;
    const enabled = Boolean(controlState[target]);
    button.textContent = enabled ? translations[currentLanguage].deactivate : translations[currentLanguage].activate;
    button.classList.toggle('is-active', enabled);
  });

  updateSyncOutput();
};

const setLanguage = (lang) => {
  if (!translations[lang]) return;
  currentLanguage = lang;
  localStorage.setItem('palaco-language', lang);
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = translations[lang][key];
    if (value) el.textContent = value;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = translations[lang][key];
    if (value) el.setAttribute('placeholder', value);
  });

  languageButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  const previousGoal = localStorage.getItem('palaco-goal');
  if (previousGoal && output) {
    output.textContent = `${translations[lang].latestGoal} ${previousGoal}`;
  }

  updateControlUI();
};

languageButtons.forEach((button) => {
  button.addEventListener('click', () => setLanguage(button.dataset.lang));
});

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const goal = input?.value.trim();
  if (!goal || !output) return;

  output.textContent = `${translations[currentLanguage].goalSet} ${goal}`;
  localStorage.setItem('palaco-goal', goal);
  form.reset();
});

controlButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const target = button.dataset.controlTarget;
    if (!target || !(target in controlState)) return;
    controlState[target] = !controlState[target];
    saveControlState();
    updateControlUI();
  });
});

syncBtn?.addEventListener('click', () => {
  localStorage.setItem('palaco-last-sync', new Date().toISOString());
  updateSyncOutput();
});

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  if (installBtn) installBtn.hidden = false;
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

setLanguage(currentLanguage);
