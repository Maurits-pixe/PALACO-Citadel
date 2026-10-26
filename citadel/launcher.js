const translations = {
  en: {
    title: 'Citadel · Module launcher',
    homeLink: '← Citadel home',
    eyebrow: 'CITADEL · MODULE ACCESS',
    launcherWord: 'LAUNCHER',
    languageLabel: 'Language',
    boundaryTitle: 'CONCEPT PREVIEWS · NOT OPERATIONAL SERVICES',
    boundaryBody: 'These modules are visual demos only. III6V9 does not protect or encrypt data; Bastion has no secure team communications; Aegis does not monitor live systems. Selecting a module grants no access or authority.',
    introEyebrow: 'SELECT A MODULE',
    menuTitle: 'Choose a Citadel preview',
    menuDescription: 'Open one of the existing concept previews in this workspace.',
    vaultCategory: 'CIPHER VAULT CONCEPT',
    vaultDescription: 'A visual cipher-vault concept with fictional examples; no authentication or encryption.',
    bastionCategory: 'COMMAND-CENTER CONCEPT',
    bastionDescription: 'A fictional team dashboard; no secure communications, authorization, or live roster.',
    aegisCategory: 'MONITORING CONCEPT',
    aegisDescription: 'Synthetic traffic and metrics only; no live monitoring or threat detection.',
    openModule: 'OPEN PREVIEW',
    returnButton: 'BACK TO MODULES',
    openStandalone: 'Open separately ↗',
    footer: 'A launcher is only navigation. It does not change the capabilities or limitations of the selected preview.',
    selectedTitle: 'Selected module: {module}'
  },
  nl: {
    title: 'Citadel · Modulelauncher',
    homeLink: '← Citadel-startpagina',
    eyebrow: 'CITADEL · MODULETOEGANG',
    launcherWord: 'LAUNCHER',
    languageLabel: 'Taal',
    boundaryTitle: 'CONCEPTVOORBEELDEN · GEEN OPERATIONELE DIENSTEN',
    boundaryBody: 'Deze modules zijn alleen visuele demo’s. III6V9 beschermt of versleutelt geen gegevens; Bastion heeft geen beveiligde teamcommunicatie; Aegis monitort geen live systemen. Een module kiezen verleent geen toegang of bevoegdheid.',
    introEyebrow: 'KIES EEN MODULE',
    menuTitle: 'Kies een Citadel-voorbeeld',
    menuDescription: 'Open een van de bestaande conceptvoorbeelden in deze werkruimte.',
    vaultCategory: 'CIPHERKLUISCONCEPT',
    vaultDescription: 'Een visueel cipherkluisconcept met fictieve voorbeelden; geen authenticatie of versleuteling.',
    bastionCategory: 'COMMANDOCENTRUMCONCEPT',
    bastionDescription: 'Een fictief teamdashboard; geen beveiligde communicatie, autorisatie of live teamoverzicht.',
    aegisCategory: 'MONITORINGCONCEPT',
    aegisDescription: 'Alleen synthetisch verkeer en meetwaarden; geen live monitoring of dreigingsdetectie.',
    openModule: 'OPEN VOORBEELD',
    returnButton: 'TERUG NAAR MODULES',
    openStandalone: 'Apart openen ↗',
    footer: 'Een launcher is alleen navigatie. Deze verandert de mogelijkheden of beperkingen van het gekozen voorbeeld niet.',
    selectedTitle: 'Gekozen module: {module}'
  },
  eo: {
    title: 'Citadel · Modul-lanĉilo',
    homeLink: '← Citadel-hejmpaĝo',
    eyebrow: 'CITADEL · MODULA ALIRO',
    launcherWord: 'LANĈILO',
    languageLabel: 'Lingvo',
    boundaryTitle: 'KONCEPTAJ DEMOJ · NE OPERACIAJ SERVOJ',
    boundaryBody: 'Ĉi tiuj moduloj estas nur vidaj demonstraĵoj. III6V9 ne protektas aŭ ĉifras datumojn; Bastion ne havas sekuran teaman komunikadon; Aegis ne monitoras realajn sistemojn. Elekto de modulo donas nek aliron nek aŭtoritaton.',
    introEyebrow: 'ELEKTU MODULON',
    menuTitle: 'Elektu Citadel-antaŭrigardon',
    menuDescription: 'Malfermu unu el la ekzistantaj konceptaj demonstraĵoj en ĉi tiu laborspaco.',
    vaultCategory: 'KONCEPTO DE ĈIFRA KLUZO',
    vaultDescription: 'Vida koncepto de ĉifra kluzo kun fikciaj ekzemploj; sen aŭtentigo aŭ ĉifrado.',
    bastionCategory: 'KONCEPTO DE KOMANDEJO',
    bastionDescription: 'Fikcia teama panelo; sen sekura komunikado, rajtigo aŭ realtempa teamlisto.',
    aegisCategory: 'KONCEPTO DE MONITORADO',
    aegisDescription: 'Nur sinteza trafiko kaj mezuroj; sen realtempa monitorado aŭ minacdetekto.',
    openModule: 'MALFERMI DEMON',
    returnButton: 'REIRI AL MODULOJ',
    openStandalone: 'Malfermi aparte ↗',
    footer: 'Lanĉilo estas nur navigado. Ĝi ne ŝanĝas la kapablojn aŭ limojn de la elektita demonstraĵo.',
    selectedTitle: 'Elektita modulo: {module}'
  }
};

const modules = {
  iii6v9: { name: 'III6V9', path: '/citadel/iii6v9/' },
  bastion: { name: 'Bastion', path: '/citadel/bastion/' },
  aegis: { name: 'Aegis', path: '/citadel/aegis/' }
};

const menu = document.querySelector('#module-menu');
const moduleView = document.querySelector('#module-view');
const frame = document.querySelector('#module-frame');
const title = document.querySelector('#active-module-title');
const returnButton = document.querySelector('#return-button');
const standaloneLink = document.querySelector('#standalone-link');
const languageSelect = document.querySelector('#language-select');
let language = 'en';
let selectedButton = null;

function translate(key) {
  return translations[language][key] || translations.en[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = language;
  if (!moduleView.hidden && selectedButton) {
    title.textContent = translate('selectedTitle').replace('{module}', modules[selectedButton.dataset.module].name);
  }
  const currentModule = selectedButton ? modules[selectedButton.dataset.module] : null;
  document.title = currentModule ? `${currentModule.name} · ${translate('title')}` : translate('title');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = translate(element.dataset.i18n);
  });
  frame.title = currentModule
    ? `${currentModule.name} · ${translate('menuTitle')}`
    : translate('menuTitle');
}

function openModule(button) {
  const module = modules[button.dataset.module];
  if (!module) return;
  selectedButton = button;
  title.textContent = translate('selectedTitle').replace('{module}', module.name);
  standaloneLink.href = module.path;
  frame.title = `${module.name} · ${translate('menuTitle')}`;
  frame.src = module.path;
  menu.hidden = true;
  moduleView.hidden = false;
  document.title = `${module.name} · ${translate('title')}`;
  returnButton.focus();
}

function returnToMenu() {
  moduleView.hidden = true;
  menu.hidden = false;
  frame.removeAttribute('src');
  document.title = translate('title');
  requestAnimationFrame(() => (selectedButton || document.querySelector('[data-module]')).focus());
}

frame.addEventListener('load', () => {
  try {
    frame.contentDocument.addEventListener('click', event => {
      if (event.target.closest('a[href="/"]')) {
        event.preventDefault();
        returnToMenu();
      }
    });
  } catch {}
});

document.querySelectorAll('[data-module]').forEach(button => {
  button.addEventListener('click', () => openModule(button));
});

returnButton.addEventListener('click', returnToMenu);
languageSelect.addEventListener('change', () => {
  language = translations[languageSelect.value] ? languageSelect.value : 'en';
  try {
    localStorage.setItem('palaco-language', language);
  } catch {}
  applyLanguage();
});

try {
  const savedLanguage = localStorage.getItem('palaco-language');
  if (translations[savedLanguage]) {
    language = savedLanguage;
    languageSelect.value = language;
  }
} catch {}

applyLanguage();
