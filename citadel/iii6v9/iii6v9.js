const copy = {
  en: {
    title: 'AETHER · Local encryption',
    back: '← PALACO home',
    language: 'Language',
    eyebrow: 'PALACO HEADQUARTERS · LOCAL CRYPTOGRAPHY',
    subtitle: 'Client-side text encryption',
    noticeTitle: 'LOCAL ENCRYPTION · SECURITY LIMITATIONS APPLY',
    noticeBody: 'Text is encrypted in this browser with AES-GCM-256 and a passphrase-derived key. Text and passphrases remain in this page’s memory until cleared; nothing is uploaded or saved in the app. You can manually download encrypted output to this device. This demo is not an audited vault; browser/device compromise, weak passphrases, or lost passphrases can expose or permanently lose data. Avoid highly sensitive information.',
    encryptMode: 'ENCRYPT',
    decryptMode: 'DECRYPT',
    cryptoTitleEncrypt: 'Encrypt text locally',
    cryptoTitleDecrypt: 'Decrypt AETHER text',
    inputLabelEncrypt: 'Text to encrypt',
    inputLabelDecrypt: 'AETHER1 encrypted text',
    inputPlaceholderEncrypt: 'Enter text to encrypt…',
    inputPlaceholderDecrypt: 'Paste the complete AETHER1 encrypted output…',
    passphraseLabel: 'Passphrase (minimum 12 characters for encryption)',
    methodNote: 'AES-GCM-256 · PBKDF2-SHA-256 · 600,000 iterations · random 16-byte salt and 12-byte IV',
    processButtonEncrypt: 'Encrypt in this browser',
    processButtonDecrypt: 'Decrypt in this browser',
    outputLabel: 'Result (not saved automatically)',
    outputPlaceholder: 'Your output appears here…',
    copyButton: 'Copy result',
    downloadButton: 'Download encrypted file',
    importButton: 'Open encrypted file',
    clearButton: 'Clear fields',
    fileNote: 'Local file transfer only: up to 4 MiB of plaintext and 6 MiB per encrypted file. The file contains ciphertext only; keep your passphrase separately.',
    formatNote: 'Encrypted output starts with AETHER1. Keep it together with your passphrase stored separately. Losing either can make recovery impossible.',
    footer: 'Encryption runs locally through the browser Web Crypto API. This page has no account, key recovery, automatic storage or sync, or independent security audit. Exported files remain under your device’s file-handling and backup controls. Verify the code and protect your passphrase before relying on it.',
    statusEncrypted: 'Encryption complete. Copy or download the ciphertext; it is not saved in the app.',
    statusDecrypted: 'Decryption complete. Plaintext is displayed only in this page.',
    statusCopied: 'Result copied to the clipboard.',
    statusDownloaded: 'Encrypted file download started. Store the file and passphrase separately.',
    statusFileOpened: 'Encrypted file opened locally. Enter its passphrase to decrypt.',
    statusCleared: 'Input, passphrase, and output cleared from the page.',
    errorInput: 'Enter text to process.',
    errorPassphrase: 'Enter a passphrase.',
    errorPassphraseLength: 'Use at least 12 characters for new encryption.',
    errorPlaintextSize: 'Plaintext must be 4 MiB or smaller.',
    errorDecryptedSize: 'Decrypted plaintext exceeds the 4 MiB limit.',
    errorEnvelopeSize: 'Encrypted input must be 6 MiB or smaller.',
    errorFile: 'Choose a valid AETHER1 encrypted file no larger than 6 MiB.',
    errorFormat: 'Invalid AETHER1 data format.',
    errorCrypto: 'Web Crypto is unavailable. Open this page in a secure browser context (HTTPS or localhost).',
    errorDecrypt: 'Decryption failed. Check the passphrase and encrypted data.',
    errorCopy: 'Clipboard access failed. Select and copy the result manually.',
    errorGeneral: 'The operation failed. Check the input and try again.',
    processing: 'Processing locally…'
  },
  nl: {
    title: 'AETHER · Lokale versleuteling',
    back: '← PALACO-startpagina',
    language: 'Taal',
    eyebrow: 'PALACO HOOFDKANTOOR · LOKALE CRYPTOGRAFIE',
    subtitle: 'Tekstversleuteling in de browser',
    noticeTitle: 'LOKALE VERSLEUTELING · BEVEILIGINGSBEPERKINGEN GELDEN',
    noticeBody: 'Tekst wordt in deze browser versleuteld met AES-GCM-256 en een uit een wachtzin afgeleide sleutel. Tekst en wachtzinnen blijven in het geheugen van de pagina tot je ze wist; er wordt niets geüpload of in de app opgeslagen. Je kunt versleutelde uitvoer handmatig naar dit apparaat downloaden. Dit is geen onafhankelijk gecontroleerde kluis; een gecompromitteerde browser of apparaat, zwakke wachtzinnen of verloren wachtzinnen kunnen gegevens blootstellen of permanent ontoegankelijk maken. Vermijd zeer gevoelige informatie.',
    encryptMode: 'VERSLEUTELEN',
    decryptMode: 'ONTCIJFEREN',
    cryptoTitleEncrypt: 'Tekst lokaal versleutelen',
    cryptoTitleDecrypt: 'AETHER-tekst ontcijferen',
    inputLabelEncrypt: 'Te versleutelen tekst',
    inputLabelDecrypt: 'Versleutelde AETHER1-tekst',
    inputPlaceholderEncrypt: 'Voer tekst in om te versleutelen…',
    inputPlaceholderDecrypt: 'Plak de volledige versleutelde AETHER1-uitvoer…',
    passphraseLabel: 'Wachtzin (minimaal 12 tekens voor versleuteling)',
    methodNote: 'AES-GCM-256 · PBKDF2-SHA-256 · 600.000 iteraties · willekeurige salt van 16 bytes en IV van 12 bytes',
    processButtonEncrypt: 'In deze browser versleutelen',
    processButtonDecrypt: 'In deze browser ontcijferen',
    outputLabel: 'Resultaat (wordt niet automatisch opgeslagen)',
    outputPlaceholder: 'Je resultaat verschijnt hier…',
    copyButton: 'Resultaat kopiëren',
    downloadButton: 'Versleuteld bestand downloaden',
    importButton: 'Versleuteld bestand openen',
    clearButton: 'Velden wissen',
    fileNote: 'Alleen lokale bestandsoverdracht: maximaal 4 MiB platte tekst en 6 MiB per versleuteld bestand. Het bestand bevat alleen ciphertext; bewaar je wachtzin apart.',
    formatNote: 'Versleutelde uitvoer begint met AETHER1. Bewaar deze apart van je wachtzin. Verlies van een van beide kan herstel onmogelijk maken.',
    footer: 'Versleuteling gebeurt lokaal via de Web Crypto-API van de browser. Deze pagina heeft geen account, sleutelherstel, automatische opslag of synchronisatie, of onafhankelijke beveiligingsaudit. Geëxporteerde bestanden vallen onder de bestands- en back-upinstellingen van je apparaat. Controleer de code en bescherm je wachtzin voordat je erop vertrouwt.',
    statusEncrypted: 'Versleuteling voltooid. Kopieer of download de ciphertext; deze wordt niet in de app opgeslagen.',
    statusDecrypted: 'Ontcijferen voltooid. De platte tekst wordt alleen op deze pagina getoond.',
    statusCopied: 'Resultaat naar het klembord gekopieerd.',
    statusDownloaded: 'Download van versleuteld bestand gestart. Bewaar bestand en wachtzin apart.',
    statusFileOpened: 'Versleuteld bestand lokaal geopend. Voer de wachtzin in om te ontcijferen.',
    statusCleared: 'Invoer, wachtzin en resultaat van de pagina gewist.',
    errorInput: 'Voer tekst in om te verwerken.',
    errorPassphrase: 'Voer een wachtzin in.',
    errorPassphraseLength: 'Gebruik minimaal 12 tekens voor nieuwe versleuteling.',
    errorPlaintextSize: 'Platte tekst mag maximaal 4 MiB groot zijn.',
    errorDecryptedSize: 'Ontcijferde platte tekst overschrijdt de limiet van 4 MiB.',
    errorEnvelopeSize: 'Versleutelde invoer mag maximaal 6 MiB groot zijn.',
    errorFile: 'Kies een geldig versleuteld AETHER1-bestand van maximaal 6 MiB.',
    errorFormat: 'Ongeldig AETHER1-gegevensformaat.',
    errorCrypto: 'Web Crypto is niet beschikbaar. Open deze pagina in een beveiligde browsercontext (HTTPS of localhost).',
    errorDecrypt: 'Ontcijferen mislukt. Controleer de wachtzin en versleutelde gegevens.',
    errorCopy: 'Klembordtoegang mislukt. Selecteer en kopieer het resultaat handmatig.',
    errorGeneral: 'De bewerking is mislukt. Controleer de invoer en probeer opnieuw.',
    processing: 'Lokaal verwerken…'
  },
  eo: {
    title: 'AETHER · Loka ĉifrado',
    back: '← PALACO-hejmpaĝo',
    language: 'Lingvo',
    eyebrow: 'PALACO-ĈEFKVARTIRO · LOKA KRIPTOGRAFIO',
    subtitle: 'Klientflanka tekstĉifrado',
    noticeTitle: 'LOKA ĈIFRADO · SEKURECAJ LIMIGOJ VALIDAS',
    noticeBody: 'Teksto estas ĉifrita en ĉi tiu retumilo per AES-GCM-256 kaj ŝlosilo derivita el pasfrazo. Teksto kaj pasfrazo restas en la memoro de ĉi tiu paĝo ĝis vi viŝas ilin; nenio estas alŝutata aŭ konservata en la aplikaĵo. Vi povas permane elŝuti ĉifritan eligon al ĉi tiu aparato. Ĉi tiu demo ne estas reviziita trezorejo; kompromitita retumilo aŭ aparato, malforta pasfrazo aŭ perdita pasfrazo povas malkaŝi aŭ por ĉiam perdi datumojn. Evitu tre sentemajn informojn.',
    encryptMode: 'ĈIFRI',
    decryptMode: 'MALĈIFRI',
    cryptoTitleEncrypt: 'Ĉifri tekston loke',
    cryptoTitleDecrypt: 'Malĉifri AETHER-tekston',
    inputLabelEncrypt: 'Teksto ĉifrota',
    inputLabelDecrypt: 'Ĉifrita AETHER1-teksto',
    inputPlaceholderEncrypt: 'Enigu tekston por ĉifri…',
    inputPlaceholderDecrypt: 'Algluu la kompletan ĉifritan AETHER1-eligon…',
    passphraseLabel: 'Pasfrazo (minimume 12 signoj por ĉifrado)',
    methodNote: 'AES-GCM-256 · PBKDF2-SHA-256 · 600 000 iteracioj · hazarda 16-bajta salo kaj 12-bajta IV',
    processButtonEncrypt: 'Ĉifri en ĉi tiu retumilo',
    processButtonDecrypt: 'Malĉifri en ĉi tiu retumilo',
    outputLabel: 'Rezulto (ne aŭtomate konservata)',
    outputPlaceholder: 'Via rezulto aperos ĉi tie…',
    copyButton: 'Kopii rezulton',
    downloadButton: 'Elŝuti ĉifritan dosieron',
    importButton: 'Malfermi ĉifritan dosieron',
    clearButton: 'Viŝi kampojn',
    fileNote: 'Nur loka dosiertransigo: ĝis 4 MiB da klara teksto kaj 6 MiB por ĉifrita dosiero. La dosiero enhavas nur ĉifrotekston; konservu la pasfrazon aparte.',
    formatNote: 'Ĉifrita eligo komenciĝas per AETHER1. Konservu ĝin aparte de via pasfrazo. Perdo de iu el ili povas malebligi reakiron.',
    footer: 'Ĉifrado okazas loke per la Web Crypto API de la retumilo. Ĉi tiu paĝo ne havas konton, ŝlosilan reakiron, aŭtomatan konservadon aŭ sinkronigon, nek sendependan sekurecan revizion. Elŝutitaj dosieroj dependas de la dosieraj kaj sekurkopiaj agordoj de via aparato. Kontrolu la kodon kaj protektu vian pasfrazon antaŭ ol fidi ĝin.',
    statusEncrypted: 'Ĉifrado finita. Kopiu aŭ elŝutu la ĉifrotekston; ĝi ne estas konservata en la aplikaĵo.',
    statusDecrypted: 'Malĉifrado finita. Klara teksto aperas nur en ĉi tiu paĝo.',
    statusCopied: 'Rezulto kopiita al tondujo.',
    statusDownloaded: 'Elŝuto de ĉifrita dosiero komenciĝis. Konservu dosieron kaj pasfrazon aparte.',
    statusFileOpened: 'Ĉifrita dosiero malfermita loke. Enigu la pasfrazon por malĉifri.',
    statusCleared: 'Enigo, pasfrazo kaj eligo viŝitaj el la paĝo.',
    errorInput: 'Enigu tekston por prilabori.',
    errorPassphrase: 'Enigu pasfrazon.',
    errorPassphraseLength: 'Uzu minimume 12 signojn por nova ĉifrado.',
    errorPlaintextSize: 'Klara teksto devas esti maksimume 4 MiB.',
    errorDecryptedSize: 'Malĉifrita klara teksto superas la limon de 4 MiB.',
    errorEnvelopeSize: 'Ĉifrita enigo devas esti maksimume 6 MiB.',
    errorFile: 'Elektu validan ĉifritan AETHER1-dosieron de maksimume 6 MiB.',
    errorFormat: 'Nevalida formato de AETHER1-datumoj.',
    errorCrypto: 'Web Crypto ne disponeblas. Malfermu ĉi tiun paĝon en sekura retumila kunteksto (HTTPS aŭ localhost).',
    errorDecrypt: 'Malĉifrado malsukcesis. Kontrolu la pasfrazon kaj ĉifritajn datumojn.',
    errorCopy: 'Aliro al tondujo malsukcesis. Mane elektu kaj kopiu la rezulton.',
    errorGeneral: 'La operacio malsukcesis. Kontrolu la enigon kaj reprovu.',
    processing: 'Loka prilaborado…'
  }
};

const ITERATIONS = 600_000;
const FORMAT_VERSION = 'AETHER1';
const MAX_PLAINTEXT_BYTES = 4 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = 6 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const languageSelect = document.querySelector('#language-select');
const input = document.querySelector('#crypto-input');
const passphrase = document.querySelector('#passphrase');
const output = document.querySelector('#crypto-output');
const status = document.querySelector('#crypto-status');
const processButton = document.querySelector('#process-button');
const encryptModeButton = document.querySelector('#encrypt-mode');
const decryptModeButton = document.querySelector('#decrypt-mode');
const copyButton = document.querySelector('#copy-output');
const downloadButton = document.querySelector('#download-output');
const importFileButton = document.querySelector('#import-file-button');
const importFileInput = document.querySelector('#import-file');
let language = 'en';
let mode = 'encrypt';

function t(key) {
  return copy[language][key] || copy.en[key] || key;
}

function setMode(nextMode) {
  mode = nextMode;
  const encrypting = mode === 'encrypt';
  encryptModeButton.setAttribute('aria-pressed', String(encrypting));
  decryptModeButton.setAttribute('aria-pressed', String(!encrypting));
  document.querySelector('#crypto-title').textContent = t(encrypting ? 'cryptoTitleEncrypt' : 'cryptoTitleDecrypt');
  document.querySelector('label[for="crypto-input"]').textContent = t(encrypting ? 'inputLabelEncrypt' : 'inputLabelDecrypt');
  input.placeholder = t(encrypting ? 'inputPlaceholderEncrypt' : 'inputPlaceholderDecrypt');
  processButton.textContent = t(encrypting ? 'processButtonEncrypt' : 'processButtonDecrypt');
  input.autocomplete = 'off';
  output.value = '';
  status.textContent = '';
  copyButton.disabled = true;
  downloadButton.disabled = true;
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelector('#crypto-title').textContent = t(mode === 'encrypt' ? 'cryptoTitleEncrypt' : 'cryptoTitleDecrypt');
  document.querySelector('label[for="crypto-input"]').textContent = t(mode === 'encrypt' ? 'inputLabelEncrypt' : 'inputLabelDecrypt');
  input.placeholder = t(mode === 'encrypt' ? 'inputPlaceholderEncrypt' : 'inputPlaceholderDecrypt');
  processButton.textContent = t(mode === 'encrypt' ? 'processButtonEncrypt' : 'processButtonDecrypt');
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x2000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const paddingStart = value.indexOf('=');
  const data = paddingStart === -1 ? value : value.slice(0, paddingStart);
  const padding = value.length - data.length;
  const expectedRemainder = padding === 2 ? 2 : padding === 1 ? 3 : 0;
  if (value.length % 4 !== 0
    || padding > 2
    || (padding > 0 && !/^={1,2}$/.test(value.slice(paddingStart)))
    || data.length % 4 !== expectedRemainder
    || !/^[A-Za-z0-9+/]*$/.test(data)) {
    throw new TypeError('format');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function deriveKey(secret, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptText(plainBytes, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  return `${FORMAT_VERSION}.${bytesToBase64(salt)}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

function decodeEnvelope(envelope) {
  const parts = envelope.trim().split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) throw new TypeError('format');
  const salt = base64ToBytes(parts[1]);
  const iv = base64ToBytes(parts[2]);
  const ciphertext = base64ToBytes(parts[3]);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new TypeError('format');
  return { salt, iv, ciphertext };
}

async function decryptText(envelope, secret) {
  const { salt, iv, ciphertext } = decodeEnvelope(envelope);
  const key = await deriveKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) throw new RangeError('size');
  return decoder.decode(plaintext);
}

async function processText(event) {
  event.preventDefault();
  const text = input.value;
  const secret = passphrase.value;
  if (!text) {
    status.textContent = t('errorInput');
    return;
  }
  const inputBytes = encoder.encode(text);
  const inputSize = inputBytes.byteLength;
  if (mode === 'encrypt' && inputSize > MAX_PLAINTEXT_BYTES) {
    status.textContent = t('errorPlaintextSize');
    return;
  }
  if (mode === 'decrypt' && inputSize > MAX_ENVELOPE_BYTES) {
    status.textContent = t('errorEnvelopeSize');
    return;
  }
  if (!secret) {
    status.textContent = t('errorPassphrase');
    return;
  }
  if (mode === 'encrypt' && [...secret].length < 12) {
    status.textContent = t('errorPassphraseLength');
    return;
  }
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    status.textContent = t('errorCrypto');
    return;
  }

  processButton.disabled = true;
  status.textContent = t('processing');
  try {
    output.value = mode === 'encrypt'
      ? await encryptText(inputBytes, secret)
      : await decryptText(text, secret);
    status.textContent = t(mode === 'encrypt' ? 'statusEncrypted' : 'statusDecrypted');
    copyButton.disabled = false;
    downloadButton.disabled = mode !== 'encrypt';
  } catch (error) {
    output.value = '';
    copyButton.disabled = true;
    downloadButton.disabled = true;
    status.textContent = error instanceof TypeError && error.message === 'format'
      ? t('errorFormat')
      : error instanceof RangeError && error.message === 'size'
        ? t('errorDecryptedSize')
        : mode === 'decrypt' ? t('errorDecrypt') : t('errorGeneral');
  } finally {
    processButton.disabled = false;
  }
}

document.querySelector('#crypto-form').addEventListener('submit', processText);
encryptModeButton.addEventListener('click', () => setMode('encrypt'));
decryptModeButton.addEventListener('click', () => setMode('decrypt'));
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = t('statusCopied');
  } catch {
    status.textContent = t('errorCopy');
  }
});
downloadButton.addEventListener('click', () => {
  if (mode !== 'encrypt' || downloadButton.disabled) return;
  const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'aether-encrypted.aether';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = t('statusDownloaded');
});
importFileButton.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_ENVELOPE_BYTES) throw new TypeError('format');
    const envelope = (await file.text()).trim();
    decodeEnvelope(envelope);
    setMode('decrypt');
    passphrase.value = '';
    input.value = envelope;
    passphrase.focus();
    status.textContent = t('statusFileOpened');
  } catch {
    status.textContent = t('errorFile');
  } finally {
    importFileInput.value = '';
  }
});
document.querySelector('#clear-fields').addEventListener('click', () => {
  input.value = '';
  passphrase.value = '';
  output.value = '';
  status.textContent = t('statusCleared');
  copyButton.disabled = true;
  downloadButton.disabled = true;
});
languageSelect.addEventListener('change', () => {
  language = copy[languageSelect.value] ? languageSelect.value : 'en';
  try {
    localStorage.setItem('palaco-language', language);
  } catch {}
  applyLanguage();
});

try {
  const savedLanguage = localStorage.getItem('palaco-language') || 'en';
  if (copy[savedLanguage]) {
    language = savedLanguage;
    languageSelect.value = language;
  }
} catch {}

encryptModeButton.setAttribute('aria-pressed', 'true');
decryptModeButton.setAttribute('aria-pressed', 'false');
copyButton.disabled = true;
downloadButton.disabled = true;
applyLanguage();
