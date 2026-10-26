<script setup>
import { computed, reactive, ref } from 'vue';
import { ArrowLeft, ExternalLink, Link2, ShieldCheck } from '@lucide/vue';

const translations = {
  en: {
    title: 'PALACO Hoofdkantoor · Launcher',
    homeLink: '← PALACO home',
    eyebrow: 'PALACO HOOFDKANTOOR · MODULE ACCESS',
    launcherWord: 'HOOFDKANTOOR',
    languageLabel: 'Language',
    boundaryTitle: 'TEMPORARY LAUNCHER · LINKS UNDER VERIFICATION',
    boundaryBody: 'This launcher only stores destinations and opens links. It does not verify app ownership, authentication, authorization, or security. Do not enter sensitive information unless you independently verify the service.',
    introEyebrow: 'CONFIGURE MODULE LINKS',
    menuTitle: 'PALACO module destinations',
    menuDescription: 'Enter only addresses you have verified with the responsible administrator. Empty addresses remain unlinked.',
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
    verified: 'Verified (self-reported)',
    unsaved: 'Address changed — save it to update',
    invalidAddress: 'Invalid address. Enter a full HTTPS URL without user credentials.',
    storageError: 'Could not save this session setting. Check browser storage permissions.',
    destinationLabel: 'Destination domain:',
    verificationLegend: 'Confirm these checks yourself',
    checkDestination: 'The destination and its responsible administrator are confirmed.',
    checkHttps: 'The service is available at this HTTPS address.',
    checkAccess: 'Authentication and authorization were explicitly checked.',
    verificationCaveat: 'These checks are your report, not an independent verification by this launcher.',
    openApp: 'Open app in a new tab',
    openFirst: 'Save the address and complete all confirmations before opening.',
    footer: 'Temporary launcher — links under verification. A configured address is not proof of a working or secure integration.'
  },
  nl: {
    title: 'PALACO Hoofdkantoor · Launcher',
    homeLink: '← PALACO-startpagina',
    eyebrow: 'PALACO HOOFDKANTOOR · MODULETOEGANG',
    launcherWord: 'HOOFDKANTOOR',
    languageLabel: 'Taal',
    boundaryTitle: 'TIJDELIJKE LAUNCHER · KOPPELINGEN IN VERIFICATIE',
    boundaryBody: 'Deze launcher bewaart alleen bestemmingen en opent links. Hij controleert geen app-eigendom, authenticatie, autorisatie of beveiliging. Gebruik geen gevoelige gegevens voordat je de dienst zelfstandig hebt gecontroleerd.',
    introEyebrow: 'KOPPELINGEN INSTELLEN',
    menuTitle: 'PALACO-modulebestemmingen',
    menuDescription: 'Vul alleen adressen in die je met de verantwoordelijke beheerder hebt gecontroleerd. Lege adressen blijven ongekoppeld.',
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
    verified: 'Geverifieerd (zelf gemeld)',
    unsaved: 'Adres gewijzigd — sla op om bij te werken',
    invalidAddress: 'Ongeldig adres. Vul een volledig HTTPS-adres in zonder gebruikersgegevens.',
    storageError: 'Deze instelling kon niet in de sessie worden opgeslagen. Controleer de browseropslag.',
    destinationLabel: 'Bestemmingsdomein:',
    verificationLegend: 'Bevestig deze controles zelf',
    checkDestination: 'De bestemming en de verantwoordelijke beheerder zijn bevestigd.',
    checkHttps: 'De dienst is bereikbaar op dit HTTPS-adres.',
    checkAccess: 'Authenticatie en autorisatie zijn expliciet gecontroleerd.',
    verificationCaveat: 'Deze controles zijn jouw verklaring; de launcher voert geen onafhankelijke verificatie uit.',
    openApp: 'App openen in een nieuw tabblad',
    openFirst: 'Sla het adres op en bevestig alle controles voordat je opent.',
    footer: 'Tijdelijke launcher — koppelingen in verificatie. Een ingesteld adres bewijst geen werkende of veilige integratie.'
  },
  eo: {
    title: 'PALACO Hoofdkantoor · Lanĉilo',
    homeLink: '← PALACO-hejmpaĝo',
    eyebrow: 'PALACO HOOFDKANTOOR · MODULA ALIRO',
    launcherWord: 'HOOFDKANTOOR',
    languageLabel: 'Lingvo',
    boundaryTitle: 'PROVIZORA LANĈILO · LIGILOJ SUB KONTROLO',
    boundaryBody: 'Ĉi tiu lanĉilo nur konservas celojn kaj malfermas ligilojn. Ĝi ne kontrolas posedon, aŭtentigon, rajtigon aŭ sekurecon de aplikaĵoj. Ne enigu sentemajn datumojn sen memstara kontrolo de la servo.',
    introEyebrow: 'AGORDI MODUL-LIGILOJN',
    menuTitle: 'Celoj de PALACO-moduloj',
    menuDescription: 'Enigu nur adresojn kontrolitajn kun la respondeca administranto. Malplenaj adresoj restas malligitaj.',
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
    verified: 'Kontrolita (memdeklarita)',
    unsaved: 'Adreso ŝanĝiĝis — konservu por ĝisdatigi',
    invalidAddress: 'Nevalida adreso. Enigu kompletan HTTPS-URL sen uzantaj datumoj.',
    storageError: 'Ne eblis konservi la sesian agordon. Kontrolu la retumilan konservadon.',
    destinationLabel: 'Cela domajno:',
    verificationLegend: 'Konfirmu ĉi tiujn kontrolojn mem',
    checkDestination: 'La celo kaj ĝia respondeca administranto estas konfirmitaj.',
    checkHttps: 'La servo disponeblas ĉe ĉi tiu HTTPS-adreso.',
    checkAccess: 'Aŭtentigo kaj rajtigo estis eksplicite kontrolitaj.',
    verificationCaveat: 'Ĉi tiuj kontroloj estas via deklaro; la lanĉilo ne faras sendependan kontrolon.',
    openApp: 'Malfermi aplikaĵon en nova langeto',
    openFirst: 'Konservu la adreson kaj konfirmu ĉiujn kontrolojn antaŭ malfermo.',
    footer: 'Provizora lanĉilo — ligiloj sub kontrolo. Agordita adreso ne pruvas funkciantan aŭ sekuran integriĝon.'
  }
};

const modules = [
  { id: 'aether', name: 'AETHER', category: 'vaultCategory', description: 'vaultDescription', className: 'vault-card' },
  { id: 'bastion', name: 'Bastion', category: 'bastionCategory', description: 'bastionDescription', className: 'bastion-card' },
  { id: 'scriptie', name: '5CRIPTIE', category: 'scriptieCategory', description: 'scriptieDescription', className: 'aegis-card' }
];
const checks = ['destination', 'https', 'access'];
const storageKey = 'palaco-launcher-links-v1';
const languageKey = 'palaco-language';

function parseHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!/^https:\/\//i.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function loadSettings() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).flatMap(([id, entry]) => {
      const url = parseHttpsUrl(entry?.url);
      if (!modules.some(module => module.id === id) || !url) return [];
      return [[id, {
        url: url.href,
        checks: Object.fromEntries(checks.map(check => [check, entry.checks?.[check] === true]))
      }]];
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
const strings = computed(() => translations[language.value]);

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

  next[module.id] = {
    url: url.href,
    checks: Object.fromEntries(checks.map(check => [check, false]))
  };
  if (!persist(next)) {
    errors[module.id] = 'storageError';
    return;
  }
  drafts[module.id] = url.href;
}

function status(module) {
  if (errors[module.id]) return errors[module.id];
  const saved = settings[module.id];
  if (!saved) return 'notConfigured';
  if (drafts[module.id].trim() !== saved.url) return 'unsaved';
  return checks.every(check => saved.checks[check]) ? 'verified' : 'configured';
}

function updateCheck(module, check, value) {
  const saved = settings[module.id];
  if (!saved) return;
  const next = {
    ...settings,
    [module.id]: {
      ...saved,
      checks: { ...saved.checks, [check]: value }
    }
  };
  errors[module.id] = persist(next) ? '' : 'storageError';
}

function isVerified(module) {
  const saved = settings[module.id];
  return Boolean(saved && drafts[module.id].trim() === saved.url && checks.every(check => saved.checks[check]));
}

function destination(module) {
  return parseHttpsUrl(settings[module.id]?.url)?.hostname || '';
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
              :class="{ 'is-error': Boolean(errors[module.id]), 'is-verified': status(module) === 'verified' }"
              aria-live="polite"
            >{{ strings[status(module)] }}</p>

            <template v-if="settings[module.id]">
              <p class="destination">
                <span>{{ strings.destinationLabel }}</span> <code data-domain>{{ destination(module) }}</code>
              </p>
              <fieldset class="verification-checks">
                <legend>{{ strings.verificationLegend }}</legend>
                <label v-for="check in checks" :key="check">
                  <input
                    type="checkbox"
                    :checked="settings[module.id].checks[check]"
                    @change="updateCheck(module, check, $event.target.checked)"
                  />
                  <span>{{ strings[`check${check[0].toUpperCase()}${check.slice(1)}`] }}</span>
                </label>
              </fieldset>
              <p class="verification-caveat">{{ strings.verificationCaveat }}</p>
              <a
                v-if="isVerified(module)"
                class="open-link"
                data-open-link
                :href="settings[module.id].url"
                target="_blank"
                rel="noopener noreferrer"
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
