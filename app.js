const form = document.querySelector('#goal-form');
const input = document.querySelector('#goal');
const output = document.querySelector('#goal-output');
const languageButtons = document.querySelectorAll('.lang-btn');
const installBtn = document.querySelector('#install-btn');

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
    footer: 'PALACO · Konstruu la kondiĉojn. Faru ĝin grava.',
    goalSet: 'PALACO-celo agordita:',
    latestGoal: 'Plej lasta celo:'
  }
};

let currentLanguage = localStorage.getItem('palaco-language') || 'en';

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
