'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const elements = {
    runtimeStatus: byId('runtime-status'), runtimeConnection: byId('runtime-connection'),
    contextStatus: byId('context-status'), retry: byId('retry-connection'),
    consentPanel: byId('consent-panel'), consentForm: byId('consent-form'),
    chatConsent: byId('chat-consent'), householdConsent: byId('household-consent'),
    start: byId('start-session'), pause: byId('pause-runtime'), reset: byId('reset-conversation'),
    feedback: byId('feedback'), chatForm: byId('chat-form'), input: byId('message-input'),
    send: byId('send-message'), help: byId('message-help'), conversation: byId('conversation'),
    emptyConversation: byId('conversation-empty'), thinking: byId('thinking'),
    sessionTag: byId('session-tag'), householdSummary: byId('household-summary'),
    proposalCount: byId('proposal-count'), proposals: byId('proposals-list'),
    proposalConsentHelp: byId('proposal-consent-help'), reviewConsent: byId('review-consent'),
    receipts: byId('receipts-list'), starters: [...document.querySelectorAll('[data-prompt]')],
  };
  const labels = { task: 'Taak', shopping: 'Boodschap', memory: 'Geheugen' };
  const operationLabels = { add: 'Toevoegen', complete: 'Afronden', forget: 'Verwijderen' };
  const errors = {
    PROVIDER_NOT_CONFIGURED: 'De AI-verbinding is nog niet ingesteld. Je bericht is niet verstuurd.',
    PROVIDER_UNAVAILABLE: 'OpenAI is nu niet bereikbaar. Je bericht blijft in het invoerveld staan.',
    PROVIDER_ERROR: 'HARAM kon geen antwoord ophalen. Probeer het later opnieuw.',
    CONSENT_REQUIRED: 'Geef eerst toestemming om met HARAM te praten.',
    HOUSEHOLD_CONSENT_REQUIRED: 'Geef eerst toestemming om je huishoudcontext te gebruiken.',
    INVALID_REQUEST: 'Deze aanvraag kon niet worden verwerkt. Controleer je invoer.',
    MESSAGE_TOO_LONG: 'Je bericht is te lang. Maak het wat korter en probeer opnieuw.',
    CSRF_INVALID: 'Je sessie is gewijzigd. Vernieuw de pagina voordat je verdergaat.',
    INVALID_CSRF: 'Je sessie is gewijzigd. Vernieuw de pagina voordat je verdergaat.',
    PROPOSAL_EXPIRED: 'Dit voorstel is verlopen. Vraag HARAM om een nieuw voorstel.',
    PROPOSAL_CONFLICT: 'Je overzicht is intussen veranderd. Vraag HARAM om een nieuw voorstel.',
    PROPOSAL_NOT_FOUND: 'Dit voorstel is niet meer beschikbaar.',
    DIGEST_MISMATCH: 'Het voorstel is veranderd. Controleer het opnieuw voordat je goedkeurt.',
    BUSY: 'HARAM is nog bezig. Wacht even of pauzeer het gesprek.',
    RUNTIME_PAUSED: 'Het gesprek is gepauzeerd. Geef opnieuw toestemming om verder te praten.',
  };
  let state = null;
  let busy = false;
  let pausing = false;
  let operationNumber = 0;
  let activeRequest = null;
  let loading = false;
  let consentWasEdited = false;
  let renderedConversation = '';
  let renderedProposals = '';
  let renderedHousehold = '';
  let renderedReceipts = '';

  const text = (value) => typeof value === 'string' ? value : '';
  const array = (value) => Array.isArray(value) ? value : [];
  const create = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  const formatTime = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date)
      : '';
  };
  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : String(value);
  };
  const setFeedback = (message, isError = false) => {
    elements.feedback.textContent = message;
    elements.feedback.dataset.error = String(isError);
  };
  const isReady = () => Boolean(state?.consent?.chat && state?.runtime?.providerConfigured && state?.runtime?.state === 'READY');

  function refreshControls() {
    const connected = Boolean(state?.csrfToken);
    const chatReady = isReady();
    elements.start.disabled = !connected || busy || !elements.chatConsent.checked;
    elements.chatConsent.disabled = !connected || busy;
    elements.householdConsent.disabled = !connected || busy;
    elements.pause.disabled = !connected || pausing || (!state?.consent?.chat && !busy);
    elements.reset.disabled = !connected || busy || !array(state?.conversation).length;
    elements.input.disabled = !chatReady || busy;
    elements.send.disabled = !chatReady || busy || !elements.input.value.trim();
    elements.starters.forEach((button) => { button.disabled = !chatReady || busy; });
    elements.proposals.querySelectorAll('button[data-proposal-action]').forEach((button) => {
      button.disabled = busy || !chatReady || !state?.consent?.household;
    });
    elements.proposalConsentHelp.hidden = !array(state?.proposals).some((proposal) => proposal.status === 'PENDING') || Boolean(state?.consent?.chat && state?.consent?.household);
    elements.reviewConsent.disabled = busy;
    elements.thinking.hidden = !(busy && !pausing && activeRequest?.kind === 'chat');
    elements.chatForm.setAttribute('aria-busy', String(busy && activeRequest?.kind === 'chat'));
    elements.help.textContent = !chatReady
      ? 'Geef eerst toestemming. Daarna kun je een bericht sturen.'
      : busy ? 'HARAM is bezig. Je kunt de toestemming altijd intrekken.'
        : 'Je bericht en gesprekscontext worden naar OpenAI gestuurd.';
    if (busy) {
      elements.runtimeStatus.textContent = pausing ? 'Toestemming intrekken…' : activeRequest?.kind === 'chat' ? 'HARAM denkt mee' : 'Je keuze verwerken…';
      elements.runtimeStatus.dataset.state = 'THINKING';
    } else if (state) {
      const ready = isReady();
      const thinking = state.runtime.state === 'THINKING';
      elements.runtimeStatus.textContent = thinking ? 'HARAM denkt mee' : ready ? 'Klaar om mee te denken' : 'Gepauzeerd';
      elements.runtimeStatus.dataset.state = thinking ? 'THINKING' : ready ? 'READY' : 'PAUSED';
    }
  }

  function renderConversation(messages) {
    const fingerprint = JSON.stringify(messages);
    if (fingerprint === renderedConversation) return;
    renderedConversation = fingerprint;
    const scroller = elements.conversation.parentElement;
    const nearEnd = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 120;
    const known = new Map([...elements.conversation.children].map((node) => [node.dataset.messageId, node]));
    const currentIds = new Set();
    messages.forEach((message) => {
      if (!message || !['user', 'assistant'].includes(message.role)) return;
      const id = String(message.id);
      currentIds.add(id);
      let node = known.get(id);
      if (!node) {
        node = create('article', 'message');
        node.dataset.messageId = id;
        node.dataset.role = message.role;
        node.setAttribute('aria-label', message.role === 'user' ? 'Jouw bericht' : 'Antwoord van HARAM');
        const heading = create('div', 'message-heading');
        heading.append(create('strong', '', message.role === 'user' ? 'Jij' : 'HARAM'));
        const time = create('time', '', formatTime(message.at));
        if (text(message.at)) time.dateTime = message.at;
        heading.append(time);
        node.append(heading, create('p', 'message-text', text(message.text)));
        elements.conversation.append(node);
      } else {
        const body = node.querySelector('.message-text');
        if (body.textContent !== text(message.text)) body.textContent = text(message.text);
      }
    });
    known.forEach((node, id) => { if (!currentIds.has(id)) node.remove(); });
    elements.emptyConversation.hidden = messages.length > 0;
    if (nearEnd && messages.length) scroller.scrollTop = scroller.scrollHeight;
  }

  function renderHousehold(household) {
    const fingerprint = JSON.stringify(household);
    if (fingerprint === renderedHousehold) return;
    renderedHousehold = fingerprint;
    const items = array(household?.items);
    elements.householdSummary.textContent = `${text(household?.label) || 'Mijn huishouden'} · lokaal overzicht · versie ${Number.isInteger(household?.revision) ? household.revision : 0}`;
    const sections = [
      ['task', 'tasks', 'Nog geen taken vastgelegd.'],
      ['shopping', 'shopping', 'Je boodschappenlijst is nog leeg.'],
      ['memory', 'memory', 'Nog niets om te onthouden vastgelegd.'],
    ];
    sections.forEach(([kind, prefix, empty]) => {
      const list = byId(`${prefix}-list`);
      const selected = items.filter((item) => item.kind === kind);
      byId(`${prefix}-count`).textContent = String(selected.length);
      const fragment = document.createDocumentFragment();
      if (!selected.length) fragment.append(create('li', 'empty-list', empty));
      selected.forEach((item) => {
        const li = create('li');
        li.dataset.itemId = String(item.id);
        const mark = create('span', 'item-mark');
        mark.setAttribute('aria-hidden', 'true');
        mark.dataset.done = String(Boolean(item.done));
        mark.dataset.kind = kind;
        const content = create('div', 'item-content');
        const title = create('p', 'item-title', text(item.title));
        title.dataset.done = String(Boolean(item.done));
        content.append(title);
        if (text(item.details)) content.append(create('p', 'item-detail', item.details));
        const metadata = [item.done ? 'Afgerond' : '', item.dueDate ? `Gepland: ${formatDate(item.dueDate)}` : ''].filter(Boolean);
        if (metadata.length) content.append(create('p', 'item-meta', metadata.join(' · ')));
        li.append(mark, content);
        fragment.append(li);
      });
      list.replaceChildren(fragment);
    });
  }

  function proposalField(list, label, value) {
    const row = create('div');
    row.append(create('dt', '', label), create('dd', '', value));
    list.append(row);
  }

  function renderProposals(proposals) {
    const pending = proposals.filter((proposal) => proposal.status === 'PENDING');
    const fingerprint = JSON.stringify(pending);
    if (fingerprint === renderedProposals) return;
    renderedProposals = fingerprint;
    elements.proposalCount.textContent = String(pending.length);
    const fragment = document.createDocumentFragment();
    if (!pending.length) fragment.append(create('p', 'empty-list', 'Er zijn nog geen voorstellen.'));
    pending.forEach((proposal) => {
      const action = proposal.action || {};
      const operation = operationLabels[action.operation] || String(action.operation || 'Onbekende wijziging');
      const item = array(state?.household?.items).find((entry) => entry.id === action.itemId);
      const title = text(action.title) || text(item?.title) || 'Lokale wijziging';
      const card = create('article', 'proposal-card');
      card.dataset.proposalId = String(proposal.id);
      card.append(create('p', 'proposal-kicker', 'Voorstel · wacht op jouw keuze'), create('h4', '', title));
      const fields = create('dl', 'proposal-fields');
      proposalField(fields, 'Wijziging', operation);
      proposalField(fields, 'Onderdeel', labels[action.kind] || labels[item?.kind] || text(action.kind) || 'Onbekend');
      proposalField(fields, 'Titel', title);
      if (text(action.details)) proposalField(fields, 'Inhoud', action.details);
      if (text(action.dueDate)) proposalField(fields, 'Datum', formatDate(action.dueDate));
      if (text(action.itemId)) proposalField(fields, 'Item-ID', action.itemId);
      if (action.operation === 'complete') proposalField(fields, 'Na akkoord', action.done === false ? 'Niet afgerond' : 'Afgerond');
      if (action.operation === 'forget') proposalField(fields, 'Na akkoord', 'Dit item wordt uit het lokale overzicht verwijderd.');
      card.append(fields);
      const actions = create('div', 'proposal-actions');
      [['approve', 'Goedkeuren', 'primary-button'], ['reject', 'Afwijzen', 'secondary-button']].forEach(([actionName, label, className]) => {
        const button = create('button', className, label);
        button.type = 'button';
        button.dataset.proposalAction = actionName;
        button.dataset.proposalId = String(proposal.id);
        button.setAttribute('aria-label', `${label}: ${title}`);
        button.addEventListener('click', () => decideProposal(proposal, actionName));
        actions.append(button);
      });
      card.append(actions);
      if (text(proposal.expiresAt)) {
        const expires = new Date(proposal.expiresAt);
        const date = Number.isFinite(expires.getTime())
          ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'short', timeStyle: 'short' }).format(expires)
          : proposal.expiresAt;
        card.append(create('p', 'proposal-expiry', `Geldig tot ${date}. De runtime controleert dit opnieuw bij goedkeuring.`));
      }
      const proof = create('details', 'proposal-proof');
      proof.append(create('summary', '', 'Herkomst van dit voorstel'), create('code', '', `Voorstel-ID: ${String(proposal.id)}\nDigest: ${text(proposal.digest)}`));
      card.append(proof);
      fragment.append(card);
    });
    elements.proposals.replaceChildren(fragment);
  }

  function renderReceipts(receipts) {
    const fingerprint = JSON.stringify(receipts);
    if (fingerprint === renderedReceipts) return;
    renderedReceipts = fingerprint;
    const fragment = document.createDocumentFragment();
    if (!receipts.length) fragment.append(create('li', 'empty-list', 'Er zijn nog geen wijzigingen uitgevoerd.'));
    receipts.slice().reverse().forEach((receipt) => {
      const li = create('li');
      li.dataset.receiptId = String(receipt.id);
      li.append(create('span', 'receipt-label', `${operationLabels[receipt.operation] || text(receipt.operation) || 'Wijziging'} vastgelegd · versie ${Number.isInteger(receipt.revision) ? receipt.revision : '—'}`));
      li.append(create('span', 'receipt-meta', `Voorstel ${String(receipt.proposalId)}${formatTime(receipt.at) ? ` · ${formatTime(receipt.at)}` : ''}`));
      fragment.append(li);
    });
    elements.receipts.replaceChildren(fragment);
  }

  function applyState(next) {
    if (!next || typeof next.csrfToken !== 'string' || !next.runtime || !next.consent || !next.household) {
      throw new Error('De lokale runtime gaf geen bruikbaar antwoord. Probeer opnieuw te verbinden.');
    }
    state = next;
    const runtime = state.runtime;
    const verified = runtime.providerConnection === 'VERIFIED';
    elements.runtimeConnection.textContent = !runtime.providerConfigured
      ? 'OpenAI is nog niet ingesteld op de lokale server.'
      : verified ? `OpenAI · verbinding bevestigd${text(runtime.model) ? ` · ${runtime.model}` : ''}`
        : `OpenAI ingesteld · nog geen antwoord bevestigd${text(runtime.model) ? ` · ${runtime.model}` : ''}`;
    elements.contextStatus.textContent = state.consent.chat
      ? state.consent.household ? 'Chat en huishoudcontext: toestemming gegeven.' : 'Chat: toestemming gegeven. Huishoudcontext wordt niet meegestuurd.'
      : 'Geen chattoestemming. Je kunt rustig je lokale overzicht bekijken.';
    elements.sessionTag.textContent = runtime.state === 'THINKING' ? 'Even bezig' : isReady() ? 'Gesprek open' : 'Gepauzeerd';
    elements.sessionTag.dataset.state = runtime.state === 'THINKING' ? 'THINKING' : isReady() ? 'READY' : 'PAUSED';
    elements.start.firstChild.textContent = state.consent.chat ? 'Toestemming bijwerken ' : 'Start met HARAM ';
    elements.consentPanel.querySelector('summary>span').textContent = state.consent.chat ? 'Toestemming en privacy' : 'Begin met jouw toestemming';
    if (!consentWasEdited) {
      elements.chatConsent.checked = Boolean(state.consent.chat);
      elements.householdConsent.checked = Boolean(state.consent.household);
    }
    if (!state.consent.chat) elements.consentPanel.open = true;
    elements.retry.hidden = true;
    renderConversation(array(state.conversation));
    renderHousehold(state.household);
    renderProposals(array(state.proposals));
    renderReceipts(array(state.receipts));
    refreshControls();
  }

  async function request(path, data, signal) {
    const response = await fetch(path, {
      method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: data === undefined ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': state?.csrfToken || '' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal,
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('De lokale runtime gaf geen leesbaar antwoord.'); }
    if (!response.ok) {
      const detail = payload?.error;
      throw new Error(errors[detail?.code] || text(detail?.message) || 'Dit lukte niet. Probeer opnieuw.');
    }
    return payload;
  }

  async function loadState() {
    if (loading || busy) return;
    loading = true;
    elements.retry.disabled = true;
    elements.runtimeStatus.textContent = 'Verbinding controleren…';
    elements.runtimeStatus.dataset.state = 'CONNECTING';
    try {
      const payload = await request('/api/state');
      applyState(payload.state || payload);
      setFeedback('');
    } catch (error) {
      elements.runtimeStatus.textContent = 'Lokale runtime niet bereikbaar';
      elements.runtimeStatus.dataset.state = 'ERROR';
      elements.runtimeConnection.textContent = 'Controleer of deze lokale ontwikkelomgeving nog draait.';
      elements.retry.hidden = false;
      setFeedback(error.message || 'De verbinding kon niet worden gemaakt.', true);
    } finally {
      loading = false;
      elements.retry.disabled = false;
      refreshControls();
    }
  }

  async function mutate(path, data, kind, successMessage, afterSuccess) {
    if (busy || !state) return false;
    const number = ++operationNumber;
    const controller = new AbortController();
    activeRequest = { controller, kind };
    busy = true;
    setFeedback('');
    refreshControls();
    try {
      const payload = await request(path, data, controller.signal);
      if (number !== operationNumber) return false;
      applyState(payload.state || payload);
      if (afterSuccess) afterSuccess();
      setFeedback(successMessage);
      return true;
    } catch (error) {
      if (number === operationNumber && error.name !== 'AbortError') setFeedback(error.message || 'Dit lukte niet. Probeer opnieuw.', true);
      return false;
    } finally {
      if (number === operationNumber) {
        busy = false;
        activeRequest = null;
        refreshControls();
      }
    }
  }

  async function pauseRuntime() {
    if (!state || pausing) return;
    const number = ++operationNumber;
    activeRequest?.controller.abort();
    activeRequest = null;
    busy = true;
    pausing = true;
    setFeedback('');
    refreshControls();
    try {
      const payload = await request('/api/consent', { chat: false, household: false });
      if (number !== operationNumber) return;
      consentWasEdited = false;
      applyState(payload.state || payload);
      elements.consentPanel.open = true;
      setFeedback('Toestemming ingetrokken. HARAM is gepauzeerd.');
    } catch (error) {
      if (number !== operationNumber) return;
      setFeedback(`Intrekken is nog niet bevestigd. ${error.message || 'Probeer opnieuw.'}`, true);
    } finally {
      if (number === operationNumber) {
        busy = false;
        pausing = false;
        refreshControls();
      }
    }
  }

  async function decideProposal(proposal, actionName) {
    if (busy || !state?.consent?.household) return;
    const id = encodeURIComponent(String(proposal.id));
    const body = actionName === 'approve' ? { digest: text(proposal.digest) } : {};
    await mutate(`/api/proposals/${id}/${actionName}`, body, 'proposal', actionName === 'approve'
      ? 'Goedgekeurd en lokaal vastgelegd. Je overzicht is bijgewerkt.'
      : 'Voorstel afgewezen. Je huishoudcontext is niet gewijzigd.');
  }

  elements.chatConsent.addEventListener('change', () => { consentWasEdited = true; refreshControls(); });
  elements.householdConsent.addEventListener('change', () => { consentWasEdited = true; });
  elements.consentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.chatConsent.checked) return;
    await mutate('/api/consent', { chat: true, household: elements.householdConsent.checked }, 'consent', 'Toestemming opgeslagen.', () => {
      consentWasEdited = false;
      elements.consentPanel.open = false;
      elements.input.disabled = !isReady();
      if (isReady()) elements.input.focus();
    });
  });
  elements.input.addEventListener('input', refreshControls);
  elements.chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = elements.input.value.trim();
    if (!message || !isReady()) return;
    const originalDraft = elements.input.value;
    const completed = await mutate('/api/chat', { message }, 'chat', '', () => {
      if (elements.input.value === originalDraft) elements.input.value = '';
    });
    if (completed && isReady()) elements.input.focus();
  });
  elements.starters.forEach((button) => button.addEventListener('click', () => {
    if (!isReady() || busy) return;
    elements.input.value = button.dataset.prompt;
    refreshControls();
    elements.input.focus();
  }));
  elements.pause.addEventListener('click', pauseRuntime);
  elements.reviewConsent.addEventListener('click', () => {
    elements.consentPanel.open = true;
    elements.householdConsent.focus();
  });
  elements.reset.addEventListener('click', () => mutate('/api/reset', {}, 'reset', 'Gesprek gewist. Je lokale huishoudelijke gegevens blijven in het overzicht.'));
  elements.retry.addEventListener('click', loadState);
  loadState();
})();
