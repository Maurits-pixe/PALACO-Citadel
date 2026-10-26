const translations = {
  en: {
    title: 'PALACO Hoofdkantoor · Launcher',
    homeLink: '← PALACO home',
    eyebrow: 'PALACO HOOFDKANTOOR · MODULE ACCESS',
    launcherWord: 'HOOFDKANTOOR',
    languageLabel: 'Language',
    boundaryTitle: 'CONCEPT PREVIEWS · NOT OPERATIONAL SERVICES',
    boundaryBody: 'These modules are limited prototypes. AETHER performs local AES-GCM text encryption but is not an audited vault; Bastion is not production-secure and its messages are not end-to-end encrypted; 5CRIPTIE uses synthetic data and does not scan or monitor live systems. Selecting a module grants no access or authority.',
    introEyebrow: 'SELECT A MODULE',
    menuTitle: 'Choose a module preview',
    menuDescription: 'Open one of the existing concept previews in this workspace.',
    vaultCategory: 'LOCAL TEXT ENCRYPTION',
    vaultDescription: 'Encrypt or decrypt text locally with Web Crypto AES-GCM-256; not an audited vault.',
    bastionCategory: 'COMMAND-CENTER CONCEPT',
    bastionDescription: 'An authenticated development prototype; not production-secure and chat is not end-to-end encrypted.',
    aegisCategory: 'CODE INTEGRITY · SIMULATION',
    aegisDescription: 'Synthetic scan logs and metrics only; no code scanning or live threat monitoring.',
    openModule: 'OPEN PREVIEW',
    returnButton: 'BACK TO MODULES',
    openStandalone: 'Open separately ↗',
    footer: 'A launcher is only navigation. It does not change the capabilities or limitations of the selected preview.',
    selectedTitle: 'Selected module: {module}'
  },
  nl: {
    title: 'PALACO Hoofdkantoor · Launcher',
    homeLink: '← PALACO-startpagina',
    eyebrow: 'PALACO HOOFDKANTOOR · MODULETOEGANG',
    launcherWord: 'HOOFDKANTOOR',
    languageLabel: 'Taal',
    boundaryTitle: 'CONCEPTVOORBEELDEN · GEEN OPERATIONELE DIENSTEN',
    boundaryBody: 'Dit zijn beperkte prototypes. AETHER versleutelt tekst lokaal met AES-GCM maar is geen gecontroleerde kluis; Bastion is niet productieveilig en berichten zijn niet end-to-end versleuteld; 5CRIPTIE gebruikt synthetische gegevens en scant of monitort geen live systemen. Een module kiezen verleent geen toegang of bevoegdheid.',
    introEyebrow: 'KIES EEN MODULE',
    menuTitle: 'Kies een modulevoorbeeld',
    menuDescription: 'Open een van de bestaande conceptvoorbeelden in deze werkruimte.',
    vaultCategory: 'LOKALE TEKSTVERSLEUTELING',
    vaultDescription: 'Versleutel of ontcijfer tekst lokaal met Web Crypto AES-GCM-256; geen gecontroleerde kluis.',
    bastionCategory: 'COMMANDOCENTRUMCONCEPT',
    bastionDescription: 'Een geauthenticeerd ontwikkelprototype; niet productieveilig en chat is niet end-to-end versleuteld.',
    aegisCategory: 'CODE-INTEGRITEIT · SIMULATIE',
    aegisDescription: 'Alleen synthetische scanlogs en meetwaarden; geen code-scan of live dreigingsmonitoring.',
    openModule: 'OPEN VOORBEELD',
    returnButton: 'TERUG NAAR MODULES',
    openStandalone: 'Apart openen ↗',
    footer: 'Een launcher is alleen navigatie. Deze verandert de mogelijkheden of beperkingen van het gekozen voorbeeld niet.',
    selectedTitle: 'Gekozen module: {module}'
  },
  eo: {
    title: 'PALACO Hoofdkantoor · Lanĉilo',
    homeLink: '← PALACO-hejmpaĝo',
    eyebrow: 'PALACO HOOFDKANTOOR · MODULA ALIRO',
    launcherWord: 'HOOFDKANTOOR',
    languageLabel: 'Lingvo',
    boundaryTitle: 'KONCEPTAJ DEMOJ · NE OPERACIAJ SERVOJ',
    boundaryBody: 'Ĉi tiuj estas limigitaj prototipoj. AETHER loke ĉifras tekston per AES-GCM sed ne estas kontrolita trezorejo; Bastion ne estas produkt-sekura kaj ĝiaj mesaĝoj ne estas ĉifritaj fine-al-fine; 5CRIPTIE uzas sintezajn datumojn kaj ne skanas aŭ monitoras realajn sistemojn. Elekto donas nek aliron nek aŭtoritaton.',
    introEyebrow: 'ELEKTU MODULON',
    menuTitle: 'Elektu modulan antaŭrigardon',
    menuDescription: 'Malfermu unu el la ekzistantaj konceptaj demonstraĵoj en ĉi tiu laborspaco.',
    vaultCategory: 'LOKA TEKSTĈIFRADO',
    vaultDescription: 'Ĉifru aŭ malĉifru tekston loke per Web Crypto AES-GCM-256; ne reviziita trezorejo.',
    bastionCategory: 'KONCEPTO DE KOMANDEJO',
    bastionDescription: 'Aŭtentigita disvolva prototipo; ne produkt-sekura kaj babilejo ne estas ĉifrita fine-al-fine.',
    aegisCategory: 'KODA INTEGRECO · SIMULADO',
    aegisDescription: 'Nur sintezaj skanaj protokoloj kaj mezuroj; sen koda skanado aŭ realtempa monitorado.',
    openModule: 'MALFERMI DEMON',
    returnButton: 'REIRI AL MODULOJ',
    openStandalone: 'Malfermi aparte ↗',
    footer: 'Lanĉilo estas nur navigado. Ĝi ne ŝanĝas la kapablojn aŭ limojn de la elektita demonstraĵo.',
    selectedTitle: 'Elektita modulo: {module}'
  }
};

const modules = {
  aether: { name: 'AETHER', path: '/citadel/iii6v9/' },
  bastion: { name: 'Bastion', path: '/citadel/bastion-app/' },
  scriptie: { name: '5CRIPTIE', path: '/citadel/aegis/' }
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
      if (event.target.closest('a[href="/"], a[href="/citadel/"]')) {
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
