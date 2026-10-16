'use strict';
(() => {
  const MAX_BYTES = 8192;
  const TIMEOUT_MS = 8000;
  const byId = id => document.getElementById(id);
  const nova = byId('runtime-nova');
  const device = byId('runtime-device');
  const feedback = byId('availability-feedback');
  const refresh = byId('refresh-availability');
  const version = byId('build-version');
  const exampleContact = byId('pp-example-contact');
  const exampleTransport = byId('pp-example-transport');
  const exampleShow = byId('pp-example-show');
  const exampleResult = byId('pp-example-result');
  const pending = new Set();
  let checking = false;
  let generation = 0;
  let pageActive = true;
  const unconfirmedCopy = 'De bereikbaarheid is niet bevestigd. Kies Opnieuw controleren om opnieuw te kijken.';
  const offlineCopy = 'Je bent offline. Maak verbinding en kies daarna Opnieuw controleren.';

  const exampleCopy = {
    UNCONFIRMED: 'Voorbeeld: er is nog geen telefoonnummer of e-mailadres bevestigd. Daarmee is er nog geen chattoelating in het ontwerp.',
    PHONE: 'Voorbeeld: een bevestigd telefoonnummer is via je P.P. gekoppeld aan je eigen persoons-ID. Daarmee krijg je chattoelating in het ontwerp. Wifi, mobiele data of een andere verbinding verandert dit niet.',
    EMAIL: 'Voorbeeld: een bevestigd e-mailadres is via je P.P. gekoppeld aan je eigen persoons-ID. Daarmee krijg je chattoelating in het ontwerp. Wifi, mobiele data of een andere verbinding verandert dit niet.',
  };

  function resetExample() {
    exampleResult.dataset.state = 'not-confirmed';
    exampleResult.textContent = 'De voorbeeldkeuze is gewijzigd. Kies Toon voorbeeld om de uitleg te bekijken.';
  }

  function showExample() {
    const confirmed = exampleContact.value === 'PHONE' || exampleContact.value === 'EMAIL';
    const knownTransport = ['WIFI', 'MOBILE', 'OTHER'].includes(exampleTransport.value);
    exampleResult.dataset.state = confirmed && knownTransport ? 'eligible' : 'not-confirmed';
    exampleResult.textContent = confirmed && knownTransport ? exampleCopy[exampleContact.value] : exampleCopy.UNCONFIRMED;
    exampleResult.focus();
  }

  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validNova = value => object(value)
    && value.component === 'NOVA_RECEPTION' && value.version === '0.3' && value.running === true
    && value.receptionEnabled === true && value.firstAcceptanceEnabled === true && value.checkGateEnabled === true
    && value.guardianRuntimeConnected === false && value.stewardRuntimeConnected === false
    && value.finalConsentEnabled === false && value.chatEnabled === false;
  const validDevice = value => object(value)
    && value.component === 'RIO_DEVICE_TEST' && value.version === '0.1' && value.mode === 'TEST_ONLY'
    && value.running === true && value.accountAccess === 'CLOSED' && value.auth === 'HOLD'
    && value.serverReadable === true && value.generatedCodesOnly === true && value.authenticatedIdentity === false
    && value.accountActive === false && value.account1 === 'HOLD' && value.canOpenContact === false
    && value.operativeAuthority === 'NONE' && value.endToEndEncrypted === false;

  async function runtime(path, valid) {
    const controller = new AbortController();
    pending.add(controller);
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let reader;
    try {
      const response = await fetch(path, {
        method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
          || !response.body) throw new Error('Unavailable');
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let size = 0;
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('Unavailable');
        content += decoder.decode(value, { stream: true });
      }
      content += decoder.decode();
      const result = JSON.parse(content);
      if (!valid(result)) throw new Error('Unavailable');
      return result;
    } finally {
      clearTimeout(timer);
      pending.delete(controller);
      controller.abort();
      if (reader) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }

  function state(element, available) {
    element.textContent = available ? 'Bereikbaar' : 'Niet bevestigd';
    element.dataset.state = available ? 'available' : 'unconfirmed';
  }

  function invalidateAvailability() {
    generation++;
    for (const controller of pending) controller.abort();
    state(nova, false);
    state(device, false);
    version.textContent = 'Onbekend';
    feedback.textContent = navigator.onLine === false ? offlineCopy : unconfirmedCopy;
    checking = false;
    refresh.disabled = false;
  }

  async function checkAvailability() {
    if (checking) return;
    if (!pageActive || navigator.onLine === false) {
      invalidateAvailability();
      return;
    }
    const run = ++generation;
    checking = true;
    refresh.disabled = true;
    for (const element of [nova, device]) {
      element.textContent = 'Wordt gecontroleerd';
      element.dataset.state = 'checking';
    }
    version.textContent = 'Onbekend';
    feedback.textContent = 'NOVA kijkt of de twee proefroutes bereikbaar zijn.';
    const results = await Promise.allSettled([
      runtime('/api/rio/nova/runtime', validNova),
      runtime('/api/rio/device-test/runtime', validDevice),
    ]);
    // A departed/offline page invalidates the whole pair, including already fulfilled reads.
    // An older round must also leave a newer round's busy/button state untouched.
    if (run !== generation) return;
    if (!pageActive || navigator.onLine === false) {
      invalidateAvailability();
      return;
    }
    const novaAvailable = results[0].status === 'fulfilled';
    const deviceAvailable = results[1].status === 'fulfilled';
    state(nova, novaAvailable);
    state(device, deviceAvailable);
    if (deviceAvailable) {
      const build = results[1].value.buildCommit;
      if (typeof build === 'string' && /^[a-f0-9]{40}$/.test(build)) version.textContent = build.slice(0, 12);
    }
    feedback.textContent = novaAvailable && deviceAvailable
      ? 'Beide proefroutes zijn bereikbaar. Je kunt zelf een volgende stap kiezen.'
      : novaAvailable || deviceAvailable
        ? 'Eén proefroute is bereikbaar. De andere is niet bevestigd. Je kunt de bereikbaarheid opnieuw controleren.'
        : 'De bereikbaarheid is niet bevestigd. Je kunt de controle zelf opnieuw starten.';
    checking = false;
    refresh.disabled = false;
  }

  refresh.addEventListener('click', () => { void checkAvailability(); });
  exampleContact.addEventListener('change', resetExample);
  exampleTransport.addEventListener('change', resetExample);
  exampleShow.addEventListener('click', showExample);
  window.addEventListener('offline', invalidateAvailability);
  window.addEventListener('online', () => {
    if (!checking) invalidateAvailability();
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    invalidateAvailability();
  });
  window.addEventListener('pageshow', event => {
    const restored = !pageActive || event.persisted;
    pageActive = true;
    if (restored) invalidateAvailability();
  });
  void checkAvailability();
})();
