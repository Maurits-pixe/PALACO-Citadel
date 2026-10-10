const scenarioSelect = document.querySelector('#scenario');
const statusElement = document.querySelector('#status');
const views = document.querySelector('#views');
let activeRequest = null;
let executing = false;
const executeButton = document.querySelector('#execute');
const maintenanceControls = document.querySelector('#maintenance-controls');
const resourceStatus = document.querySelector('#resource-status');
const outcomeLabels = { READ_RESULT: 'Informatie bekeken', EXPLANATION: 'Uitleg beschikbaar', PROPOSAL: 'Voorstel beschikbaar', REVIEW_REQUIRED: 'Beoordeling nodig', BLOCKED: 'Deze opdracht is geblokkeerd', STALE: 'De controle is niet meer actueel', EXPIRED: 'De opdracht is verlopen', REVOKED: 'Toestemming is ingetrokken', OFFLINE_READ_ONLY: 'Alleen lezen is beschikbaar', EXECUTION_PENDING_AUTHORIZATION: 'De opdracht is voorbereid', EXECUTED_WITH_RECEIPT: 'Testonderhoud uitgevoerd' };

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function field(parent, label, value, marker) {
  const row = element('div', undefined, 'field');
  row.append(element('dt', label));
  const display = element('dd', value ?? 'UNKNOWN');
  if (marker) display.dataset.field = marker;
  row.append(display);
  parent.append(row);
}
function list(parent, title, values, marker) {
  const block = element('section', undefined, 'detail-block');
  block.append(element('h3', title));
  const items = element('ul');
  if (marker) items.dataset.field = marker;
  const content = Array.isArray(values) && values.length ? values : ['Geen vermeldingen.'];
  for (const value of content) items.append(element('li', typeof value === 'string' ? value : JSON.stringify(value)));
  block.append(items);
  parent.append(block);
}
function renderSurface(container, projection) {
  const result = projection.result;
  container.dataset.canonicalResultId = projection.canonicalResultId;
  container.dataset.canonicalDigest = projection.canonicalDigest;
  const body = container.querySelector('.surface-body');
  body.replaceChildren();
  const outcome = element('p', result.resultType, 'outcome');
  outcome.dataset.field = 'resultType';
  body.append(element('p', outcomeLabels[result.resultType] ?? 'Uitkomst onbekend', 'human-outcome'));
  body.append(outcome);
  const states = element('dl', undefined, 'state-grid');
  for (const key of ['package', 'conformance', 'authority', 'distribution', 'activation', 'freshness', 'execution']) {
    field(states, key.toUpperCase(), result.state?.[key], 'state-' + key);
  }
  body.append(states);
  const identity = element('dl', undefined, 'details');
  field(identity, 'ELIXER', result.identity?.elixerId, 'elixerId');
  field(identity, 'HARA-huishouden', result.identity?.householdId ?? 'Niet gekoppeld', 'household');
  field(identity, 'Versie', result.identity?.version, 'version');
  field(identity, 'Tenant / wereld / citadel', [result.identity?.tenantId, result.identity?.worldId, result.identity?.citadelId].join(' / '), 'context');
  field(identity, 'Scope', (result.scope ?? []).join(', ') || 'Geen', 'scope');
  field(identity, 'Toestemming', result.consent?.status, 'consent');
  field(identity, 'Toestemmingsreferentie', result.consent?.reference ?? 'Geen', 'consentReference');
  field(identity, 'Autorisatie', result.authorization?.status, 'authorization');
  field(identity, 'Autorisatiereferentie', result.authorization?.reference ?? 'Geen', 'authorizationReference');
  field(identity, 'Herkomst', result.evidence?.provenance, 'provenance');
  field(identity, 'Verificatie', result.evidence?.verification, 'verification');
  body.append(identity);
  list(body, 'Onzekerheid', result.uncertainty, 'uncertainty');
  list(body, 'Redencodes', result.reasonCodes, 'reasonCodes');
  list(body, 'Herkomstverwijzingen', result.evidence?.references, 'evidenceReferences');
  list(body, 'Persona-adviezen', (result.personaResults ?? []).map((persona) => persona.personaId + ' · ' + persona.status + ' · ' + persona.recommendation + ': ' + persona.message), 'personas');
  list(body, 'Afwijkende stemmen', (result.dissent ?? []).map((dissent) => dissent.personaId + ': ' + dissent.message), 'dissent');
  if (result.proposal) {
    const proposal = element('p', 'Intern voorstel: ' + result.proposal.recommendation + '. Dit voorstel verleent geen bevoegdheid.', 'proposal');
    proposal.dataset.field = 'proposal';
    body.append(proposal);
  }
  if (result.executionReceipt) {
    const receipt = result.executionReceipt;
    const committed = element('section', undefined, 'commit-receipt');
    committed.append(element('h3', 'Onderhoudsbewijs'));
    const details = element('dl', undefined, 'details');
    field(details, 'Handeling', receipt.action, 'action');
    field(details, 'Doel', receipt.targetId, 'targetId');
    field(details, 'Versie voor / na', receipt.previousVersion + ' → ' + receipt.appliedVersion, 'versions');
    field(details, 'Uitvoeringsbewijs', receipt.receiptId, 'actionReceiptId');
    field(details, 'Opslag', receipt.storage, 'storage');
    field(details, 'Echte externe wijziging', receipt.externalSideEffect ? 'Ja' : 'Nee; fictief voorbeeld', 'externalSideEffect');
    committed.append(details); body.append(committed);
  }
  const trace = element('dl', undefined, 'details trace');
  field(trace, 'Gedeelde resultaatreferentie', projection.canonicalResultId, 'canonicalResultId');
  field(trace, 'Gedeelde toestandsdigest', projection.canonicalDigest, 'canonicalDigest');
  field(trace, 'Correlatie', result.correlationId, 'correlationId');
  field(trace, 'Spoorvolgnummer', result.trace?.sequence, 'traceSequence');
  field(trace, 'Laboratoriumreceipt', result.trace?.receiptId, 'receiptId');
  field(trace, 'Spoorhash', result.trace?.hash, 'traceHash');
  body.append(trace);
}
function matchingProjections(data) {
  return data?.canonical?.resultId &&
    data.full?.surface === 'FULL_ELIXER' && data.widget?.surface === 'WIDGET' &&
    data.full.canonicalResultId === data.canonical.resultId &&
    data.widget.canonicalResultId === data.canonical.resultId &&
    data.full.canonicalDigest === data.widget.canonicalDigest &&
    typeof data.full.canonicalDigest === 'string' &&
    JSON.stringify(data.full.result) === JSON.stringify(data.canonical) &&
    JSON.stringify(data.widget.result) === JSON.stringify(data.canonical);
}
function present(data) {
  if (!matchingProjections(data)) throw new Error('SURFACE_STATE_MISMATCH');
  renderSurface(document.querySelector('#full'), data.full);
  renderSurface(document.querySelector('#widget'), data.widget);
  views.hidden = false;
  statusElement.textContent = 'ELIXER en widget delen resultaat ' + data.canonical.resultId + '.';
  if (data.resources?.[0]) resourceStatus.textContent = 'Voorbeeldversie: ' + data.resources[0].version + '. Vastgelegde wijzigingen: ' + (data.executionReceipts?.length ?? 0) + '.';
}
async function update() {
  maintenanceControls.hidden = scenarioSelect.value !== 'execution-authorized';
  if (activeRequest) activeRequest.abort();
  const controller = new AbortController();
  activeRequest = controller;
  views.hidden = true;
  statusElement.textContent = 'De gedeelde toestand wordt geladen.';
  try {
    const response = await fetch('/api/state?scenario=' + encodeURIComponent(scenarioSelect.value), { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('PREVIEW_UNAVAILABLE');
    const data = await response.json();
    if (controller !== activeRequest) return;
    present(data);
  } catch (error) {
    if (error?.name === 'AbortError' || controller !== activeRequest) return;
    statusElement.textContent = 'De proefweergave is niet beschikbaar. Er wordt geen eerdere toestand als actuele uitkomst getoond.';
    views.hidden = true;
  }
}
executeButton.addEventListener('click', async () => {
  if (executing || scenarioSelect.value !== 'execution-authorized') return;
  if (activeRequest) activeRequest.abort();
  executing = true; executeButton.disabled = true; scenarioSelect.disabled = true;
  maintenanceControls.setAttribute('aria-busy', 'true');
  statusElement.textContent = 'HARA controleert de exacte opdracht en voert het testonderhoud uit.';
  try {
    const response = await fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'APPLY_SYNTHETIC_MAINTENANCE' }), cache: 'no-store' });
    if (!response.ok) throw new Error('EXECUTION_UNAVAILABLE');
    present(await response.json());
  } catch { views.hidden = true; statusElement.textContent = 'Het resultaat is niet beschikbaar. Open het voorbeeld opnieuw om de vastgelegde toestand te controleren.'; }
  finally { executing = false; executeButton.disabled = false; scenarioSelect.disabled = false; maintenanceControls.removeAttribute('aria-busy'); }
});
scenarioSelect.addEventListener('change', update);
update();
