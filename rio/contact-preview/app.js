'use strict';

(() => {
  const PHASES = new Set(['WAITING_NOVA', 'COMMIT_CONFIRMATION', 'QUEUED', 'WAITING_DELIVERY_NOVA', 'DELIVERY_CONFIRMATION', 'DELIVERED', 'CLOSED', 'HOLD']);
  const ACTIONS = ['NOVA_ADMIT', 'FINAL_ACCEPT', 'PREPARE_DELIVERY', 'ADMIT_DELIVERY', 'REFRESH_GUARDS', 'HOLD', 'DECLINE', 'REVOKE'];
  const LABELS = {
    NOVA_ADMIT: 'NOVA binnenlaten',
    FINAL_ACCEPT: 'Deze tekst en controles bevestigen',
    PREPARE_DELIVERY: 'Aflevering aanvragen',
    ADMIT_DELIVERY: 'NOVA voor aflevering binnenlaten',
    REFRESH_GUARDS: 'Proefcontroles vernieuwen',
    HOLD: 'Op wacht zetten',
    DECLINE: 'Verzoek weigeren',
    REVOKE: 'Toestemming intrekken'
  };
  const PHASE_LABELS = {
    WAITING_NOVA: 'Wacht op NOVA',
    COMMIT_CONFIRMATION: 'Wacht op beide bevestigingen',
    QUEUED: 'In de lokale wachtrij',
    WAITING_DELIVERY_NOVA: 'NOVA voor aflevering wacht',
    DELIVERY_CONFIRMATION: 'Aflevering: beide bevestigingen',
    DELIVERED: 'Lokaal afgeleverd',
    CLOSED: 'Contact gesloten',
    HOLD: 'Op wacht'
  };
  const PHASE_HELP = {
    WAITING_NOVA: 'De ontvanger beslist eerst of NOVA de ontvangstzone mag betreden. De proeftekst is daar nog afgeschermd.',
    COMMIT_CONFIRMATION: 'Bekijk de exacte proeftekst en de gesimuleerde controles. Beide testpersonen geven afzonderlijk hun definitieve instemming.',
    QUEUED: 'Het verzoek staat in de duurzame lokale wachtrij. De afzender kan nu bewust de volgende stap naar aflevering aanvragen.',
    WAITING_DELIVERY_NOVA: 'De ontvanger beslist opnieuw over toelating voor de afleverstap. Eerdere instemming wordt niet automatisch hergebruikt.',
    DELIVERY_CONFIRMATION: 'Voor aflevering gelden de actuele proefcontroles en opnieuw de instemming van beide kanten.',
    DELIVERED: 'De proeftekst is afgeleverd aan de lokale testontvanger. Dit is geen aflevering via een netwerk.',
    CLOSED: 'Dit contactverzoek is gesloten. De andere kant krijgt geen privéreden te zien.',
    HOLD: 'Het verzoek staat stil. Controleer de actuele stand voordat je opnieuw bevestigt.'
  };
  const ROLE_LABELS = {
    IDENTITY: 'Identiteit',
    ADDRESS: 'P.P.-adressering',
    HUMAN_CONSENT: 'Menselijke toestemming',
    SCOPE_POLICY: 'Rechten en beleid',
    E2EE_KEYS: 'Sleutels',
    CONTENT_INTEGRITY: 'Inhoud en integriteit',
    REPLAY_ORDER: 'Herhaling en volgorde',
    PRIVACY: 'Privacy',
    DELIVERY_REVOCATION: 'Aflevering en intrekking'
  };
  const pathSide = location.pathname === '/sender/' ? 'SENDER' : location.pathname === '/receiver/' ? 'RECEIVER' : null;
  const $ = (id) => document.getElementById(id);
  const elements = {
    main: $('main'), title: $('role-title'), intro: $('role-intro'), route: $('notification-route'),
    counter: $('rio-counter'), status: $('status'), error: $('error'), connection: $('connection-status'),
    compose: $('compose'), form: $('compose-form'), input: $('message-text'), length: $('text-length'),
    send: $('send-button'), refresh: $('refresh-button'), requests: $('requests'), count: $('request-count'), empty: $('empty-state')
  };
  const cards = new Map();
  const retryIds = new Map();
  let state = null;
  let connected = false;
  let posting = false;
  let refreshing = false;
  let firstLoad = true;
  let pollTimer = null;
  const encoder = new TextEncoder();

  function node(tag, className, text) {
    const value = document.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }
  function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function validState(value) {
    if (!plainObject(value) || value.mode !== 'REFERENCE_ONLY' || value.classification !== 'SYNTHETIC_ONLY' ||
        value.side !== pathSide || typeof value.csrfToken !== 'string' || value.csrfToken.length < 16 ||
        !Number.isSafeInteger(value.notifications) || value.notifications < 0 || !Array.isArray(value.requests) ||
        value.requests.length > 100) return false;
    const ids = new Set();
    return value.requests.every((request) => {
      if (!plainObject(request) || typeof request.id !== 'string' || request.id.length > 128 ||
          ids.has(request.id) || typeof request.revision !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(request.revision) ||
          !PHASES.has(request.phase) || !['SERVICE_COMMIT', 'QUEUED_DELIVERY'].includes(request.stage) ||
          !(request.text === null || typeof request.text === 'string') ||
          !Number.isSafeInteger(request.byteLength) || request.byteLength < 1 || request.byteLength > 1024 ||
          typeof request.payloadDigest !== 'string' ||
          !(request.contractDigest === null || typeof request.contractDigest === 'string') ||
          !(request.evidenceSetDigest === null || typeof request.evidenceSetDigest === 'string') ||
          !plainObject(request.confirmations) || typeof request.confirmations.sender !== 'boolean' ||
          typeof request.confirmations.receiver !== 'boolean' || !Array.isArray(request.guards) ||
          !Array.isArray(request.allowedActions) ||
          request.allowedActions.some((action) => !ACTIONS.includes(action)) ||
          typeof request.createdAt !== 'string') return false;
      if (request.text !== null && encoder.encode(request.text).byteLength !== request.byteLength) return false;
      const roles = new Set();
      if (!request.guards.every((guard) => {
        if (!plainObject(guard) || !Object.hasOwn(ROLE_LABELS, guard.roleCode) || roles.has(guard.roleCode) ||
            !['SIMULATED_PASS', 'UNKNOWN'].includes(guard.sender) ||
            !['SIMULATED_PASS', 'UNKNOWN'].includes(guard.receiver)) return false;
        roles.add(guard.roleCode);
        return true;
      })) return false;
      ids.add(request.id);
      return true;
    });
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = false;
  }
  function clearError() {
    elements.error.hidden = true;
    elements.error.textContent = '';
  }
  function announce(message) {
    elements.status.textContent = message;
  }
  function finalAvailable(request) {
    return request.text !== null && typeof request.contractDigest === 'string' && request.contractDigest.length > 0 &&
      typeof request.evidenceSetDigest === 'string' && request.evidenceSetDigest.length > 0;
  }
  function updateControls() {
    const bytes = encoder.encode(elements.input.value).byteLength;
    elements.length.textContent = bytes + ' / 1024 bytes';
    elements.input.setAttribute('aria-invalid', bytes > 1024 ? 'true' : 'false');
    elements.send.disabled = !connected || posting || state?.side !== 'SENDER' || bytes < 1 || bytes > 1024;
    elements.input.disabled = posting;
    elements.refresh.disabled = posting;
    elements.main.setAttribute('aria-busy', posting ? 'true' : 'false');
    for (const card of cards.values()) {
      for (const [type, button] of card.buttons) {
        button.disabled = !connected || posting || !card.data.allowedActions.includes(type) ||
          (type === 'FINAL_ACCEPT' && !finalAvailable(card.data));
      }
    }
  }

  function createCard(id) {
    const article = node('article', 'surface request-card');
    article.dataset.requestId = id;
    const heading = node('div', 'surface-heading');
    const headingRow = node('div', 'request-heading');
    const titleBox = node('div');
    const title = node('h3');
    title.tabIndex = -1;
    const identifier = node('p', 'request-label', 'Verzoek ' + id);
    const phase = node('span', 'phase');
    titleBox.append(title, identifier);
    headingRow.append(titleBox, phase);
    heading.append(headingRow);
    const body = node('div', 'surface-body');
    const help = node('p', 'phase-help');
    const messageSection = node('section', 'request-message');
    const messageTitle = node('h3', '', 'Exacte proeftekst');
    const text = node('p', 'text-box');
    messageSection.append(messageTitle, text);
    const confirmations = node('div', 'confirmations');
    const senderConfirmation = node('div', 'confirmation');
    const receiverConfirmation = node('div', 'confirmation');
    const senderLabel = node('strong', '', 'AFZENDER');
    const receiverLabel = node('strong', '', 'ONTVANGER');
    const senderValue = node('span');
    const receiverValue = node('span');
    senderConfirmation.append(senderLabel, senderValue);
    receiverConfirmation.append(receiverLabel, receiverValue);
    confirmations.append(senderConfirmation, receiverConfirmation);
    const guardsSection = node('section');
    const guardsHeading = node('div', 'guard-heading');
    guardsHeading.append(node('h3', '', 'De negen bodyguards'), node('span', 'simulated-tag', 'GESIMULEERD'));
    const table = node('table', 'guard-table');
    const caption = node('caption', 'sr-only', 'Gesimuleerde controles aan beide kanten');
    const tableHead = node('thead');
    const tr = node('tr');
    for (const label of ['Specialiteit', 'Afzender', 'Ontvanger']) {
      const th = node('th', '', label);
      th.scope = 'col';
      tr.append(th);
    }
    tableHead.append(tr);
    const tableBody = node('tbody');
    table.append(caption, tableHead, tableBody);
    guardsSection.append(guardsHeading, table, node('p', 'guard-note', '“Proef akkoord” is een gesimuleerde uitslag. De sleutelcontrole bouwt hier geen versleuteld berichtenkanaal.'));
    const bindingDetails = node('details', 'bindings');
    const bindingSummary = node('summary', '', 'Waar geldt je bevestiging voor?');
    const bindingList = node('dl');
    const digestNodes = new Map();
    for (const [key, label] of [['payloadDigest', 'Exacte proeftekst'], ['contractDigest', 'Afspraak en actuele stap'], ['evidenceSetDigest', 'Actuele proefcontroles']]) {
      const pair = node('div');
      const dd = node('dd');
      pair.append(node('dt', '', label), dd);
      bindingList.append(pair);
      digestNodes.set(key, dd);
    }
    bindingDetails.append(bindingSummary, node('p', '', 'Je bevestigt alleen de getoonde tekst met deze afspraak en deze controles. Bij een nieuwe stap of gewijzigde controles is nieuwe instemming nodig.'), bindingList);
    const finalNote = node('p', 'final-note', 'Door te bevestigen stem je als testpersoon bewust in met de exacte proeftekst en de getoonde controles. Deze knop geeft geen toestemming voor echte berichten.');
    const actions = node('div', 'request-actions');
    const buttons = new Map();
    for (const type of ACTIONS) {
      const button = node('button', ['DECLINE', 'REVOKE'].includes(type) ? 'danger' : ['HOLD', 'REFRESH_GUARDS'].includes(type) ? 'secondary' : '', LABELS[type]);
      button.type = 'button';
      button.dataset.action = type;
      button.hidden = true;
      button.addEventListener('click', () => submitRequestAction(id, type));
      buttons.set(type, button);
      actions.append(button);
    }
    body.append(help, messageSection, confirmations, guardsSection, bindingDetails, finalNote, actions);
    article.append(heading, body);
    const card = { article, title, phase, help, text, senderValue, receiverValue, tableBody, digestNodes, finalNote, buttons, data: null };
    cards.set(id, card);
    elements.requests.append(article);
    return card;
  }

  function updateCard(card, request, index) {
    card.data = request;
    card.article.dataset.phase = request.phase;
    card.title.textContent = 'Contactverzoek ' + (index + 1);
    card.phase.textContent = PHASE_LABELS[request.phase];
    card.phase.classList.toggle('closed', ['CLOSED', 'HOLD'].includes(request.phase));
    card.help.textContent = PHASE_HELP[request.phase];
    card.text.textContent = request.text === null
      ? 'De proeftekst is afgeschermd totdat NOVA bewust is binnengelaten.'
      : request.text;
    card.text.dataset.visible = request.text === null ? 'false' : 'true';
    card.senderValue.textContent = request.confirmations.sender ? 'Bewust bevestigd' : 'Nog niet bevestigd';
    card.receiverValue.textContent = request.confirmations.receiver ? 'Bewust bevestigd' : 'Nog niet bevestigd';
    const rowFragment = document.createDocumentFragment();
    for (const role of Object.keys(ROLE_LABELS)) {
      const guard = request.guards.find((item) => item.roleCode === role);
      const row = node('tr');
      const roleCell = node('th', '', ROLE_LABELS[role]);
      roleCell.scope = 'row';
      row.append(roleCell);
      for (const side of ['sender', 'receiver']) {
        const passed = guard?.[side] === 'SIMULATED_PASS';
        row.append(node('td', passed ? 'guard-good' : 'guard-unknown', passed ? 'Proef akkoord' : 'Onbekend'));
      }
      rowFragment.append(row);
    }
    card.tableBody.replaceChildren(rowFragment);
    for (const [key, target] of card.digestNodes) target.textContent = request[key] || 'Nog niet beschikbaar';
    card.finalNote.hidden = !request.allowedActions.includes('FINAL_ACCEPT');
    for (const [type, button] of card.buttons) {
      button.hidden = !request.allowedActions.includes(type);
    }
  }

  function render(value) {
    state = value;
    connected = true;
    const sender = value.side === 'SENDER';
    elements.title.textContent = sender ? 'RIO · afzender' : 'RIO · ontvanger';
    document.title = sender ? 'RIO — afzender · lokale proef' : 'RIO — ontvanger · lokale proef';
    elements.intro.textContent = sender
      ? 'Begin een proefverzoek en volg de instemming van beide kanten.'
      : 'Ontvang NOVA in de ontvangstzone en beslis bewust over ieder proefverzoek.';
    elements.route.hidden = sender;
    elements.compose.hidden = !sender;
    elements.counter.textContent = String(value.notifications);
    elements.counter.setAttribute('aria-label', value.notifications + ' open meldingen');
    elements.connection.textContent = 'Verbonden met de lokale proef · stand wordt elke twee seconden gelezen.';
    elements.count.textContent = value.requests.length + (value.requests.length === 1 ? ' verzoek' : ' verzoeken');
    elements.empty.hidden = value.requests.length !== 0;
    elements.empty.textContent = sender ? 'Er zijn nog geen verzoeken. Begin met een verzonnen proeftekst.' : 'Er zijn nog geen binnenkomende verzoeken.';
    const activeIds = new Set(value.requests.map((request) => request.id));
    for (const [id, card] of cards) {
      if (!activeIds.has(id)) {
        card.article.remove();
        cards.delete(id);
      }
    }
    value.requests.forEach((request, index) => updateCard(cards.get(request.id) || createCard(request.id), request, index));
    updateControls();
  }

  async function readState({ manual = false, announceResult = false } = {}) {
    if (refreshing || posting || !pathSide) return false;
    refreshing = true;
    if (manual) clearError();
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), 8000);
    try {
      const response = await fetch('/api/state', {
        method: 'GET', headers: { Accept: 'application/json', 'X-RIO-Side': pathSide },
        credentials: 'same-origin', cache: 'no-store', signal: timeout.signal
      });
      if (!response.ok) throw new Error('De lokale stand is niet beschikbaar.');
      const value = await response.json();
      if (!validState(value)) throw new Error('De ontvangen stand kan niet veilig worden getoond.');
      const oldNotifications = state?.notifications;
      render(value);
      if (firstLoad || announceResult || manual) announce('Actuele stand geladen.');
      else if (oldNotifications !== value.notifications) announce(value.notifications + ' open meldingen.');
      firstLoad = false;
      return true;
    } catch (error) {
      connected = false;
      elements.connection.textContent = 'Geen actuele verbinding. Handelingen zijn tijdelijk uitgeschakeld.';
      updateControls();
      if (manual || firstLoad) showError(error.name === 'AbortError'
        ? 'De lokale proef antwoordt nog niet. Ververs om opnieuw te proberen.'
        : error.message);
      return false;
    } finally {
      refreshing = false;
      clearTimeout(timeoutId);
    }
  }

  function actionIdFor(key) {
    if (retryIds.has(key)) return retryIds.get(key);
    if (typeof crypto.randomUUID !== 'function') throw new Error('Dit venster kan geen unieke handeling maken. Open het via het lokale proefadres.');
    const id = crypto.randomUUID();
    if (retryIds.size >= 64) retryIds.delete(retryIds.keys().next().value);
    retryIds.set(key, id);
    return id;
  }

  async function postAction(body, key, focusId = null) {
    if (posting || !connected || !state || !pathSide) return;
    clearError();
    try {
      body.actionId = actionIdFor(key);
    } catch (error) {
      showError(error.message);
      return;
    }
    const csrfToken = state.csrfToken;
    posting = true;
    updateControls();
    announce('Handeling wordt verwerkt.');
    let succeeded = false;
    const timeout = new AbortController();
    const timeoutId = setTimeout(() => timeout.abort(), 8000);
    try {
      const response = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-RIO-CSRF': csrfToken, 'X-RIO-Side': pathSide },
        credentials: 'same-origin', cache: 'no-store', signal: timeout.signal, body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(response.status === 409
          ? 'De stand is gewijzigd. Bekijk de actuele tekst en controles voordat je opnieuw kiest.'
          : response.status === 403
          ? 'Deze handeling is voor dit testvenster niet toegestaan. Ververs de stand.'
          : 'De handeling is niet bevestigd. Ververs eerst de actuele stand.');
      }
      succeeded = true;
      retryIds.delete(key);
      if (body.type === 'INITIATE') elements.input.value = '';
    } catch (error) {
      showError(error.name === 'AbortError'
        ? 'De uitkomst is nog onbekend. Ververs de stand voordat je opnieuw kiest.'
        : error.message);
    } finally {
      posting = false;
      clearTimeout(timeoutId);
      updateControls();
    }
    const loaded = await readState();
    if (succeeded && loaded) {
      announce('Handeling verwerkt. Bekijk de bijgewerkte stand.');
      if (focusId && cards.has(focusId)) cards.get(focusId).title.focus({ preventScroll: true });
      else if (body.type === 'INITIATE') elements.input.focus({ preventScroll: true });
    } else if (!loaded) {
      showError('De actuele uitkomst is nog onbekend. Ververs de stand; er wordt niets automatisch opnieuw bevestigd.');
    }
  }

  function submitRequestAction(id, type) {
    const request = cards.get(id)?.data;
    if (!request || !request.allowedActions.includes(type) || posting || !connected) return;
    if (type === 'FINAL_ACCEPT' && !finalAvailable(request)) {
      showError('De exacte tekst en controles zijn nog niet beschikbaar voor bevestiging.');
      return;
    }
    const body = { type, id: request.id, revision: request.revision };
    if (type === 'FINAL_ACCEPT') {
      body.contractDigest = request.contractDigest;
      body.evidenceSetDigest = request.evidenceSetDigest;
    }
    const key = JSON.stringify(body);
    void postAction(body, key, id);
  }

  elements.input.addEventListener('input', updateControls);
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = elements.input.value;
    const bytes = encoder.encode(text).byteLength;
    if (state?.side !== 'SENDER' || !connected || posting) return;
    if (bytes < 1 || bytes > 1024) {
      showError('Vul een proeftekst van 1 tot en met 1024 bytes in.');
      elements.input.focus();
      return;
    }
    const body = { type: 'INITIATE', text };
    void postAction(body, JSON.stringify(body));
  });
  elements.refresh.addEventListener('click', () => void readState({ manual: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void readState();
  });
  window.addEventListener('pagehide', () => { clearInterval(pollTimer); pollTimer = null; });
  window.addEventListener('pageshow', () => {
    if (!pollTimer) pollTimer = setInterval(() => { if (!document.hidden) void readState(); }, 2000);
  });
  if (!pathSide) {
    elements.title.textContent = 'Onbekend proefvenster';
    elements.connection.textContent = 'Open het afzender- of ontvangervenster via de lokale proef.';
    showError('Dit adres hoort niet bij een geldig RIO-testvenster.');
    updateControls();
    return;
  }
  void readState();
  pollTimer = setInterval(() => { if (!document.hidden) void readState(); }, 2000);
})();
