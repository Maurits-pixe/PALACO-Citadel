const scenarioSelect = document.querySelector('#scenario');
const statusElement = document.querySelector('#status');
const views = document.querySelector('#views');
let activeRequest = null;

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
  body.append(outcome);
  const states = element('dl', undefined, 'state-grid');
  for (const key of ['package', 'conformance', 'authority', 'distribution', 'activation', 'freshness', 'execution']) {
    field(states, key.toUpperCase(), result.state?.[key], 'state-' + key);
  }
  body.append(states);
  const identity = element('dl', undefined, 'details');
  field(identity, 'ELIXER', result.identity?.elixerId, 'elixerId');
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
async function update() {
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
    if (!matchingProjections(data)) throw new Error('SURFACE_STATE_MISMATCH');
    renderSurface(document.querySelector('#full'), data.full);
    renderSurface(document.querySelector('#widget'), data.widget);
    views.hidden = false;
    statusElement.textContent = 'ELIXER en widget delen resultaat ' + data.canonical.resultId + '.';
  } catch (error) {
    if (error?.name === 'AbortError' || controller !== activeRequest) return;
    statusElement.textContent = 'De proefweergave is niet beschikbaar. Er wordt geen eerdere toestand als actuele uitkomst getoond.';
    views.hidden = true;
  }
}
scenarioSelect.addEventListener('change', update);
update();
