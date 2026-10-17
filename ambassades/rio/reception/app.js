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
  const pending = new Set();
  let checking = false;

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

  async function checkAvailability() {
    if (checking) return;
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
  window.addEventListener('pagehide', () => { for (const controller of pending) controller.abort(); });
  void checkAvailability();
})();
