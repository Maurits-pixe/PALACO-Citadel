<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ArrowLeft, ExternalLink, Link2, ShieldCheck } from '@lucide/vue';
import {
  createRequestGuard,
  commitIfCurrent,
  getEvidenceStatus,
  isOriginApproved,
  normalizeApprovedOrigin,
  parseHttpsUrl,
  verifyModuleMetadata
} from './verification.js';

const translations = {
  en: {
    title: 'PALACO NEO · Launcher',
    homeLink: '← PALACO home',
    eyebrow: 'PALACO NEO · MODULE ACCESS',
    launcherWord: 'NEO',
    languageLabel: 'Language',
    boundaryTitle: 'TEMPORARY LAUNCHER · METADATA CHECKS ARE LIMITED',
    boundaryBody: 'Metadata checks confirm only that an approved HTTPS origin returned the expected appId. The appId and operational status are self-declared; this does not verify ownership, authentication, authorization, or security.',
    introEyebrow: 'CONFIGURE MODULE LINKS',
    menuTitle: 'PALACO module destinations',
    menuDescription: 'Only exact HTTPS origins configured in the deployment allowlist can be checked. Empty or unapproved destinations remain unlinked.',
    storageNote: 'Links are kept only for this browser tab session and are cleared when the session ends.',
    vaultCategory: 'CIPHER VAULT',
    vaultDescription: 'Verify the destination and its protections with its administrator before opening.',
    bastionCategory: 'TEAM COLLABORATION',
    bastionDescription: 'Verify the destination and its protections with its administrator before opening.',
    scriptieCategory: 'CODE INTEGRITY',
    scriptieDescription: 'Verify the destination and its protections with its administrator before opening.',
    addressLabel: 'App address (HTTPS only)',
    saveAddress: 'Save for this session',
    notConfigured: 'Not configured',
    configured: 'Configured — not verified',
    destinationUnapproved: 'Destination not approved',
    checkUnavailable: 'Configured — check unavailable',
    verificationFailed: 'Verification failed',
    metadataConfirmed: 'Module metadata confirmed',
    verificationExpired: 'Verification expired',
    checking: 'Checking metadata…',
    unsaved: 'Address changed — save it to update',
    invalidAddress: 'Invalid address. Enter only an HTTPS origin, without a path, query, fragment, or user credentials.',
    storageError: 'Could not save this session setting. Check browser storage permissions.',
    checkMetadata: 'Check module metadata',
    evidenceDetails: '{method} {endpoint} · Checked {checkedAt}; expires {expiresAt}. Browser metadata request + body read: {durationMs} ms. Expected appId: {expectedAppId}; received: {receivedAppId}.',
    reportedState: 'Self-reported status: {status}.',
    reason_wrong_identity: 'The endpoint did not report the expected appId.',
    reason_invalid_response: 'The endpoint response did not match the metadata contract.',
    reason_http_error: 'The endpoint returned HTTP {status}.',
    reason_timeout: 'The metadata request or response body exceeded five seconds.',
    reason_request_unavailable: 'The browser could not read the response (network, CORS, TLS, or redirect failure).',
    reason_destination_unapproved: 'This exact HTTPS origin is not in the configured allowlist.',
    reason_invalid_url: 'The configured address is not a valid HTTPS URL.',
    destinationLabel: 'Destination origin:',
    verificationLegend: 'Metadata check evidence',
    verificationCaveat: 'A matching appId is self-declared metadata. This does not verify ownership, authentication, authorization, or app security.',
    openApp: 'Open app in a new tab',
    openFirst: 'Run a successful metadata check before opening.',
    footer: 'Temporary launcher — links under verification. A configured address is not proof of a working or secure integration.'
  },
  nl: {
    title: 'PALACO NEO · Launcher',
    homeLink: '← PALACO-startpagina',
    eyebrow: 'PALACO NEO · MODULETOEGANG',
    launcherWord: 'NEO',
    languageLabel: 'Taal',
    boundaryTitle: 'TIJDELIJKE LAUNCHER · METADATA-CONTROLE IS BEPERKT',
    boundaryBody: 'Een metadata-controle bevestigt alleen dat een goedgekeurde HTTPS-origin de verwachte appId teruggaf. appId en operationele status zijn zelfgerapporteerd; eigenaarschap, authenticatie, autorisatie en beveiliging worden niet gecontroleerd.',
    introEyebrow: 'KOPPELINGEN INSTELLEN',
    menuTitle: 'PALACO-modulebestemmingen',
    menuDescription: 'Alleen exacte HTTPS-origins in de deployment-allowlist kunnen worden gecontroleerd. Lege of niet-goedgekeurde bestemmingen blijven ongekoppeld.',
    storageNote: 'Koppelingen worden alleen bewaard tijdens deze tabsessie en verdwijnen wanneer de sessie eindigt.',
    vaultCategory: 'CIPHERKLUIS',
    vaultDescription: 'Controleer de bestemming en beveiliging met de beheerder voordat je de app opent.',
    bastionCategory: 'TEAM SAMENWERKING',
    bastionDescription: 'Controleer de bestemming en beveiliging met de beheerder voordat je de app opent.',
    scriptieCategory: 'CODE-INTEGRITEIT',
    scriptieDescription: 'Controleer de bestemming en beveiliging met de beheerder voordat je de app opent.',
    addressLabel: 'Appadres (alleen HTTPS)',
    saveAddress: 'Bewaar voor deze sessie',
    notConfigured: 'Niet ingesteld',
    configured: 'Ingesteld — niet geverifieerd',
    destinationUnapproved: 'Bestemming niet goedgekeurd',
    checkUnavailable: 'Ingesteld — controle niet mogelijk',
    verificationFailed: 'Verificatie mislukt',
    metadataConfirmed: 'Modulemetadata bevestigd',
    verificationExpired: 'Verificatie verlopen',
    checking: 'Metadata controleren…',
    unsaved: 'Adres gewijzigd — sla op om bij te werken',
    invalidAddress: 'Ongeldig adres. Vul alleen een HTTPS-origin in, zonder pad, query, fragment of gebruikersgegevens.',
    storageError: 'Deze instelling kon niet in de sessie worden opgeslagen. Controleer de browseropslag.',
    checkMetadata: 'Modulemetadata controleren',
    evidenceDetails: '{method} {endpoint} · Gecontroleerd op {checkedAt}; verloopt {expiresAt}. Browserrequest + antwoordlezen: {durationMs} ms. Verwachte appId: {expectedAppId}; ontvangen: {receivedAppId}.',
    reportedState: 'Zelfgerapporteerde status: {status}.',
    reason_wrong_identity: 'Het endpoint gaf niet de verwachte appId terug.',
    reason_invalid_response: 'Het antwoord voldoet niet aan het metadata-contract.',
    reason_http_error: 'Het endpoint antwoordde met HTTP {status}.',
    reason_timeout: 'Het metadata-request of het lezen van het antwoord duurde langer dan vijf seconden.',
    reason_request_unavailable: 'De browser kon het antwoord niet lezen (netwerk-, CORS-, TLS- of redirectfout).',
    reason_destination_unapproved: 'Deze exacte HTTPS-origin staat niet op de ingestelde goedkeuringslijst.',
    reason_invalid_url: 'Het ingestelde adres is geen geldige HTTPS-URL.',
    destinationLabel: 'Bestemmingsorigin:',
    verificationLegend: 'Bewijs metadata-controle',
    verificationCaveat: 'Een overeenkomende appId is zelfgerapporteerde metadata. Dit controleert geen eigenaarschap, authenticatie, autorisatie of appbeveiliging.',
    openApp: 'App openen in een nieuw tabblad',
    openFirst: 'Voer eerst een geslaagde metadata-controle uit.',
    footer: 'Tijdelijke launcher — koppelingen in verificatie. Een ingesteld adres bewijst geen werkende of veilige integratie.'
  },
  eo: {
    title: 'PALACO NEO · Lanĉilo',
    homeLink: '← PALACO-hejmpaĝo',
    eyebrow: 'PALACO NEO · MODULA ALIRO',
    launcherWord: 'NEO',
    languageLabel: 'Lingvo',
    boundaryTitle: 'PROVIZORA LANĈILO · METADATUMA KONTROLO ESTAS LIMIGITA',
    boundaryBody: 'Metadatuma kontrolo nur konfirmas, ke aprobita HTTPS-origino liveris la atenditan appId. appId kaj funkcia stato estas memraportitaj; posedo, aŭtentigo, rajtigo kaj sekureco ne estas kontrolitaj.',
    introEyebrow: 'AGORDI MODUL-LIGILOJN',
    menuTitle: 'Celoj de PALACO-moduloj',
    menuDescription: 'Nur ekzaktaj HTTPS-originoj en la deploj-listo povas esti kontrolitaj. Malplenaj aŭ neaprobitaj celoj restas malligitaj.',
    storageNote: 'Ligiloj estas konservataj nur dum ĉi tiu retumila langeta sesio kaj foriĝas kiam ĝi finiĝas.',
    vaultCategory: 'ĈIFRA TREZOREJO',
    vaultDescription: 'Kontrolu la celon kaj ĝiajn protektojn kun la administranto antaŭ malfermo.',
    bastionCategory: 'TEAMA KUNLABORO',
    bastionDescription: 'Kontrolu la celon kaj ĝiajn protektojn kun la administranto antaŭ malfermo.',
    scriptieCategory: 'KODA INTEGRECO',
    scriptieDescription: 'Kontrolu la celon kaj ĝiajn protektojn kun la administranto antaŭ malfermo.',
    addressLabel: 'Aplikaĵa adreso (nur HTTPS)',
    saveAddress: 'Konservi por ĉi tiu sesio',
    notConfigured: 'Ne agordita',
    configured: 'Agordita — ne kontrolita',
    destinationUnapproved: 'Celo ne aprobita',
    checkUnavailable: 'Agordita — kontrolo neebla',
    verificationFailed: 'Kontrolo malsukcesis',
    metadataConfirmed: 'Modulaj metadatumoj konfirmitaj',
    verificationExpired: 'Kontrolo eksvalidiĝis',
    checking: 'Kontrolante metadatumojn…',
    unsaved: 'Adreso ŝanĝiĝis — konservu por ĝisdatigi',
    invalidAddress: 'Nevalida adreso. Enigu nur HTTPS-originon, sen vojo, query, fragmento aŭ uzantaj datumoj.',
    storageError: 'Ne eblis konservi la sesian agordon. Kontrolu la retumilan konservadon.',
    checkMetadata: 'Kontroli modulajn metadatumojn',
    evidenceDetails: '{method} {endpoint} · Kontrolita {checkedAt}; eksvalidiĝas {expiresAt}. Retumila metadatuma peto + legado: {durationMs} ms. Atendita appId: {expectedAppId}; ricevita: {receivedAppId}.',
    reportedState: 'Memraportita stato: {status}.',
    reason_wrong_identity: 'La endpoint ne raportis la atenditan appId.',
    reason_invalid_response: 'La respondo ne konformas al la metadatuma kontrakto.',
    reason_http_error: 'La endpoint respondis per HTTP {status}.',
    reason_timeout: 'La peto aŭ legado de la respondo daŭris pli ol kvin sekundojn.',
    reason_request_unavailable: 'La retumilo ne povis legi la respondon (reto, CORS, TLS aŭ alidirekto).',
    reason_destination_unapproved: 'Ĉi tiu HTTPS-origino ne estas en la agordita listo.',
    reason_invalid_url: 'La agordita adreso ne estas valida HTTPS-URL.',
    destinationLabel: 'Cela origino:',
    verificationLegend: 'Pruvo de metadatuma kontrolo',
    verificationCaveat: 'Kongrua appId estas memraportita metadatumo. Ĝi ne kontrolas posedon, aŭtentigon, rajtigon aŭ aplikaĵan sekurecon.',
    openApp: 'Malfermi aplikaĵon en nova langeto',
    openFirst: 'Unue faru sukcesan metadatuman kontrolon.',
    footer: 'Provizora lanĉilo — ligiloj sub kontrolo. Agordita adreso ne pruvas funkciantan aŭ sekuran integriĝon.'
  }
};

const modules = [
  { id: 'aether', name: 'AETHER', category: 'vaultCategory', description: 'vaultDescription', className: 'vault-card' },
  { id: 'bastion', name: 'Bastion', category: 'bastionCategory', description: 'bastionDescription', className: 'bastion-card' },
  { id: 'scriptie', appId: '5criptie', name: '5CRIPTIE', category: 'scriptieCategory', description: 'scriptieDescription', className: 'aegis-card' }
];
const storageKey = 'palaco-launcher-links-v1';
const languageKey = 'palaco-language';
const trustedOrigins = {
  aether: normalizeApprovedOrigin(import.meta.env.VITE_AETHER_ORIGIN),
  bastion: normalizeApprovedOrigin(import.meta.env.VITE_BASTION_ORIGIN),
  scriptie: normalizeApprovedOrigin(import.meta.env.VITE_SCRIPTIE_ORIGIN)
};

function loadSettings() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([id, entry]) => {
      const url = parseHttpsUrl(entry?.url);
      if (!modules.some(module => module.id === id) || !url) return [];
      return [[id, { url: url.href }]];
    }));
  } catch {
    return {};
  }
}

function loadLanguage() {
  try {
    const saved = sessionStorage.getItem(languageKey);
    return translations[saved] ? saved : 'en';
  } catch {
    return 'en';
  }
}

const language = ref(loadLanguage());
const settings = reactive(loadSettings());
const drafts = reactive(Object.fromEntries(modules.map(({ id }) => [id, settings[id]?.url || ''])));
const errors = reactive({});
const evidence = reactive({});
const checking = reactive({});
const strings = computed(() => translations[language.value]);
const requestGuard = createRequestGuard();
const expiryTimers = new Map();
const clock = ref(Date.now());
const refreshClock = () => {
  clock.value = Date.now();
};

function clearEvidence(moduleId) {
  if (expiryTimers.has(moduleId)) clearTimeout(expiryTimers.get(moduleId));
  expiryTimers.delete(moduleId);
  delete evidence[moduleId];
  delete checking[moduleId];
}

for (const module of modules) {
  watch(() => drafts[module.id], (current, previous) => {
    if (current !== previous) {
      requestGuard.begin(module.id);
      clearEvidence(module.id);
      errors[module.id] = '';
    }
  });
}

onBeforeUnmount(() => {
  for (const timer of expiryTimers.values()) clearTimeout(timer);
  document.removeEventListener('visibilitychange', refreshClock);
});
document.addEventListener('visibilitychange', refreshClock);

function persist(next) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    Object.keys(settings).forEach(id => delete settings[id]);
    Object.assign(settings, next);
    return true;
  } catch {
    return false;
  }
}

function save(module) {
  const value = drafts[module.id].trim();
  const next = { ...settings };
  requestGuard.begin(module.id);
  clearEvidence(module.id);
  errors[module.id] = '';

  if (!value) {
    delete next[module.id];
    if (!persist(next)) errors[module.id] = 'storageError';
    return;
  }

  const url = parseHttpsUrl(value);
  if (!url) {
    errors[module.id] = 'invalidAddress';
    return;
  }

  next[module.id] = { url: url.href };
  if (!persist(next)) {
    errors[module.id] = 'storageError';
    return;
  }
  drafts[module.id] = url.href;
}

function status(module) {
  clock.value;
  if (errors[module.id]) return errors[module.id];
  const draft = drafts[module.id].trim();
  if (!draft) return 'notConfigured';
  const url = parseHttpsUrl(draft);
  if (!url) return 'invalidAddress';
  if (!isOriginApproved(url.href, trustedOrigins[module.id])) return 'destinationUnapproved';
  const saved = settings[module.id];
  if (!saved || draft !== saved.url) return 'unsaved';
  if (checking[module.id]) return 'checking';
  const currentEvidence = evidence[module.id];
  if (!currentEvidence) return 'configured';
  const resultStatus = getEvidenceStatus(currentEvidence, clock.value);
  return ({
    'destination-unapproved': 'destinationUnapproved',
    'check-unavailable': 'checkUnavailable',
    'verification-failed': 'verificationFailed',
    'metadata-confirmed': 'metadataConfirmed',
    'verification-expired': 'verificationExpired'
  })[resultStatus] || 'configured';
}

function errorDetail(item) {
  if (!item) return '';
  return strings.value[`reason_${item.reason}`]
    ?.replace('{status}', String(item.httpStatus ?? ''))
    || '';
}

function evidenceDetails(item) {
  if (!item) return '';
  const date = value => value ? new Date(value).toISOString() : '—';
  return strings.value.evidenceDetails
    .replace('{checkedAt}', date(item.checkedAt))
    .replace('{expiresAt}', date(item.expiresAt))
    .replace('{expectedAppId}', item.expectedAppId || '—')
    .replace('{receivedAppId}', item.receivedAppId || '—')
    .replace('{method}', item.method || '—')
    .replace('{endpoint}', item.endpoint || '—')
    .replace('{durationMs}', String(item.durationMs ?? '—'));
}

function destination(module) {
  return parseHttpsUrl(drafts[module.id])?.origin || '';
}

function isApproved(module) {
  return isOriginApproved(drafts[module.id], trustedOrigins[module.id]);
}

function canOpen(module) {
  const currentEvidence = evidence[module.id];
  const saved = settings[module.id];
  return Boolean(
    saved
    && saved.url === drafts[module.id].trim()
    && currentEvidence?.status === 'metadata-confirmed'
    && currentEvidence.origin === parseHttpsUrl(saved.url)?.origin
    && currentEvidence.expectedAppId === module.appId
    && getEvidenceStatus(currentEvidence, clock.value) === 'metadata-confirmed'
  );
}

function openModule(module, event) {
  refreshClock();
  if (!canOpen(module)) event.preventDefault();
}

async function verify(module) {
  const saved = settings[module.id];
  if (!saved || drafts[module.id].trim() !== saved.url || !isApproved(module)) return;

  const generation = requestGuard.begin(module.id);
  clearEvidence(module.id);
  checking[module.id] = true;
  errors[module.id] = '';

  const outcome = await verifyModuleMetadata(saved.url, module.appId, trustedOrigins[module.id]);
  const current = commitIfCurrent({
    guard: requestGuard,
    id: module.id,
    generation,
    currentUrl: settings[module.id]?.url === drafts[module.id].trim() ? drafts[module.id].trim() : null,
    expectedUrl: saved.url,
    value: outcome,
    commit: value => {
      checking[module.id] = false;
      evidence[module.id] = value;
    }
  });
  if (!current) return;
  if (outcome.status === 'metadata-confirmed') {
    const delay = Math.max(0, outcome.expiresAt - Date.now());
    expiryTimers.set(module.id, setTimeout(() => {
      clock.value = Date.now();
      expiryTimers.delete(module.id);
    }, delay));
  }
}

function changeLanguage(event) {
  const selected = event.target.value;
  language.value = translations[selected] ? selected : 'en';
  try {
    sessionStorage.setItem(languageKey, language.value);
  } catch {}
  document.documentElement.lang = language.value;
  document.title = strings.value.title;
}

document.documentElement.lang = language.value;
document.title = strings.value.title;
</script>

<template>
  <header class="launcher-header">
    <a class="home-link" href="/">
      <ArrowLeft :size="15" aria-hidden="true" />
      {{ strings.homeLink.replace('← ', '') }}
    </a>
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">P</span>
      <div>
        <p class="eyebrow">{{ strings.eyebrow }}</p>
        <h1>PALACO <span>{{ strings.launcherWord }}</span></h1>
      </div>
    </div>
    <label class="language-control">
      <span>{{ strings.languageLabel }}</span>
      <select id="language-select" :value="language" @change="changeLanguage">
        <option value="en">English</option>
        <option value="nl">Nederlands</option>
        <option value="eo">Esperanto</option>
      </select>
    </label>
  </header>

  <main class="launcher-main">
    <section class="boundary-notice" aria-labelledby="boundary-title">
      <span class="notice-icon" aria-hidden="true"><ShieldCheck :size="16" /></span>
      <div>
        <h2 id="boundary-title">{{ strings.boundaryTitle }}</h2>
        <p>{{ strings.boundaryBody }}</p>
      </div>
    </section>

    <section aria-labelledby="menu-title">
      <div class="intro">
        <p class="eyebrow">{{ strings.introEyebrow }}</p>
        <h2 id="menu-title">{{ strings.menuTitle }}</h2>
        <p>{{ strings.menuDescription }}</p>
        <p class="storage-note">{{ strings.storageNote }}</p>
      </div>

      <div class="module-grid">
        <article v-for="module in modules" :key="module.id" class="module-card" :class="module.className">
          <span class="module-symbol" aria-hidden="true"><Link2 :size="25" /></span>
          <h3 class="module-name">{{ module.name }}</h3>
          <p class="module-category">{{ strings[module.category] }}</p>
          <p class="module-description">{{ strings[module.description] }}</p>

          <form class="module-form" :data-module="module.id" novalidate @submit.prevent="save(module)">
            <label :for="`${module.id}-url`">{{ strings.addressLabel }}</label>
            <div class="address-row">
              <input
                :id="`${module.id}-url`"
                v-model="drafts[module.id]"
                data-url-input
                type="url"
                inputmode="url"
                autocomplete="off"
                placeholder="https://example.com"
                :aria-describedby="`${module.id}-message`"
                @input="errors[module.id] = ''"
              />
              <button class="save-button" type="submit">{{ strings.saveAddress }}</button>
            </div>

            <p
              :id="`${module.id}-message`"
              class="module-message"
              data-message
              :class="{
                'is-error': ['invalidAddress', 'verificationFailed', 'destinationUnapproved'].includes(status(module)),
                'is-verified': status(module) === 'metadataConfirmed',
                'is-unavailable': ['checkUnavailable', 'verificationExpired'].includes(status(module))
              }"
              aria-live="polite"
            >{{ strings[status(module)] }}</p>

            <template v-if="drafts[module.id].trim()">
              <p v-if="destination(module)" class="destination">
                <span>{{ strings.destinationLabel }}</span> <code data-domain>{{ destination(module) }}</code>
              </p>
              <button
                v-if="isApproved(module) && settings[module.id]?.url === drafts[module.id].trim()"
                class="save-button verify-button"
                type="button"
                :disabled="checking[module.id]"
                @click="verify(module)"
              >{{ checking[module.id] ? strings.checking : strings.checkMetadata }}</button>
              <p v-else-if="status(module) === 'destinationUnapproved'" class="verification-caveat">
                {{ strings.reason_destination_unapproved }}
              </p>
              <p v-if="evidence[module.id] && settings[module.id]?.url === drafts[module.id].trim()" class="verification-evidence">
                {{ evidenceDetails(evidence[module.id]) }}
              </p>
              <p
                v-if="evidence[module.id]?.reportedStatus && settings[module.id]?.url === drafts[module.id].trim()"
                class="verification-caveat"
              >{{ strings.reportedState.replace('{status}', evidence[module.id].reportedStatus) }}</p>
              <p
                v-if="evidence[module.id]?.reason && settings[module.id]?.url === drafts[module.id].trim()"
                class="verification-caveat"
              >{{ errorDetail(evidence[module.id]) }}</p>
              <p class="verification-caveat">{{ strings.verificationCaveat }}</p>
              <a
                v-if="canOpen(module)"
                class="open-link"
                data-open-link
                :href="drafts[module.id]"
                target="_blank"
                rel="noopener noreferrer"
                @click="openModule(module, $event)"
              >
                {{ strings.openApp }} <ExternalLink :size="15" aria-hidden="true" />
              </a>
              <p v-else class="open-link-disabled" aria-live="polite">{{ strings.openFirst }}</p>
            </template>
          </form>
        </article>
      </div>
    </section>
    <footer class="launcher-footer">{{ strings.footer }}</footer>
  </main>
</template>
