const copy = {
  en: {
    title: 'III6V9 · Concept preview',
    back: '← Citadel home',
    language: 'Language',
    eyebrow: 'CITADEL SYSTEMS · CONCEPT 03',
    subtitle: 'Cryptic vault interface concept',
    noticeTitle: 'CONCEPT PREVIEW — NOTHING IS PROTECTED',
    noticeBody: 'This page is a visual concept using fictional examples only. It does not encrypt, authenticate, store, or erase data. Do not enter secrets.',
    lockLabel: 'INTERFACE STUDY · NO AUTHENTICATION',
    lockTitle: 'Cipher lock concept',
    lockBody: 'The dial is decorative. There is no access code or unlock action.',
    previewState: 'PREVIEW ONLY',
    fileLabel: 'FICTIONAL EXAMPLE',
    fileTitle: 'Encrypted file',
    fileName: 'sample-archive.enc',
    fileNote: 'Illustrative label only — no file is present or encrypted.',
    noteLabel: 'FICTIONAL EXAMPLE',
    noteTitle: 'Private note',
    noteName: '“A note would appear here.”',
    noteNote: 'Placeholder text only — nothing is saved.',
    switchLabel: 'DESIGN TOPIC · NOT ACTIVE',
    switchTitle: 'Inactivity response',
    switchBody: 'A “dead man’s switch” is not implemented. Browser inactivity cannot guarantee that data is erased.',
    footer: 'Presentation grants no access, security, or authority. A real vault requires a separately reviewed cryptographic design.'
  },
  nl: {
    title: 'III6V9 · Conceptvoorbeeld',
    back: '← Citadel-startpagina',
    language: 'Taal',
    eyebrow: 'CITADEL-SYSTEMEN · CONCEPT 03',
    subtitle: 'Concept voor een cryptische kluisinterface',
    noticeTitle: 'CONCEPTPREVIEW — NIETS IS BESCHERMD',
    noticeBody: 'Deze pagina is een visueel concept met uitsluitend fictieve voorbeelden. Er worden geen gegevens versleuteld, geauthenticeerd, opgeslagen of gewist. Vul geen geheimen in.',
    lockLabel: 'INTERFACESTUDIE · GEEN AUTHENTICATIE',
    lockTitle: 'Concept voor een cipher-slot',
    lockBody: 'De draaischijf is decoratief. Er is geen toegangscode of ontgrendelfunctie.',
    previewState: 'ALLEEN PREVIEW',
    fileLabel: 'FICTIEF VOORBEELD',
    fileTitle: 'Versleuteld bestand',
    fileName: 'voorbeeld-archief.enc',
    fileNote: 'Alleen een illustratief label — er is geen bestand aanwezig of versleuteld.',
    noteLabel: 'FICTIEF VOORBEELD',
    noteTitle: 'Privénotitie',
    noteName: '“Hier zou een notitie staan.”',
    noteNote: 'Alleen tijdelijke voorbeeldtekst — er wordt niets opgeslagen.',
    switchLabel: 'ONTWERPTHEMA · NIET ACTIEF',
    switchTitle: 'Reactie op inactiviteit',
    switchBody: 'Een “dead man’s switch” is niet geïmplementeerd. Inactiviteit van de browser garandeert niet dat gegevens worden gewist.',
    footer: 'Deze presentatie verleent geen toegang, beveiliging of bevoegdheid. Een echte kluis vereist een afzonderlijk beoordeeld cryptografisch ontwerp.'
  },
  eo: {
    title: 'III6V9 · Koncepta antaŭrigardo',
    back: '← Citadel-hejmpaĝo',
    language: 'Lingvo',
    eyebrow: 'CITADEL-SISTEMOJ · KONCEPTO 03',
    subtitle: 'Koncepto de kripta trezoreja interfaco',
    noticeTitle: 'KONCEPTA ANTAŬRIGARDO — NENIO ESTAS PROTEKTATA',
    noticeBody: 'Ĉi tiu paĝo estas vida koncepto kun nur fikciaj ekzemploj. Ĝi ne ĉifras, aŭtentikigas, konservas aŭ forviŝas datumojn. Ne enigu sekretojn.',
    lockLabel: 'INTERFACA STUDO · SEN AŬTENTIKIGO',
    lockTitle: 'Koncepto de ĉifra seruro',
    lockBody: 'La ciferdisko estas dekoracia. Ne ekzistas alirkodo aŭ malŝlosa ago.',
    previewState: 'NUR ANTAŬRIGARDO',
    fileLabel: 'FIKCIA EKZEMPLO',
    fileTitle: 'Ĉifrita dosiero',
    fileName: 'ekzempla-arkivo.enc',
    fileNote: 'Nur ilustra etikedo — neniu dosiero ĉeestas aŭ estas ĉifrita.',
    noteLabel: 'FIKCIA EKZEMPLO',
    noteTitle: 'Privata noto',
    noteName: '“Noto aperus ĉi tie.”',
    noteNote: 'Nur lokokupa teksto — nenio estas konservata.',
    switchLabel: 'DESIGN-TEMO · NEAKTIVA',
    switchTitle: 'Reago al neaktiveco',
    switchBody: '“Mortula ŝaltilo” ne estas efektivigita. Foliumila neaktiveco ne garantias datumforviŝon.',
    footer: 'Prezento ne donas aliron, sekurecon aŭ aŭtoritaton. Vera trezorejo bezonas aparte reviziitan kriptografian dezajnon.'
  }
};

const languageConfig = {
  en: { dir: 'ltr' },
  nl: { dir: 'ltr' },
  eo: { dir: 'ltr' },
  es: { dir: 'ltr' },
  fr: { dir: 'ltr' },
  zh: { dir: 'ltr' },
  ru: { dir: 'ltr' },
  ar: { dir: 'rtl' },
  atl: { dir: 'ltr' }
};

const selected = document.querySelector('#language-select');
const savedLanguage = localStorage.getItem('palaco-language') || 'en';
const activeLanguage = Object.hasOwn(languageConfig, savedLanguage) ? savedLanguage : 'en';

function setLanguage(language) {
  const locale = Object.hasOwn(languageConfig, language) ? language : 'en';
  const messages = copy[locale] || copy.en;
  document.documentElement.lang = locale;
  document.documentElement.dir = languageConfig[locale].dir;
  document.title = messages.title;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (messages[key]) element.textContent = messages[key];
  });
  selected.value = ['en', 'nl', 'eo'].includes(locale) ? locale : 'en';
  localStorage.setItem('palaco-language', locale);
}

selected.addEventListener('change', () => setLanguage(selected.value));
setLanguage(activeLanguage);
