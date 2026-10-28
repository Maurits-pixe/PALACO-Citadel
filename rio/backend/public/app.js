import { createRioWorkspace } from '../client.mjs';

const byId = id => document.getElementById(id);
const ui = Object.fromEntries(['connection', 'connection-label', 'connection-detail', 'request-form', 'verify-form',
  'email', 'code', 'request-code', 'verify-code', 'signed-in', 'user-label', 'sign-out', 'note-form', 'note-title',
  'note-body', 'note-consent', 'save-note', 'refresh-notes', 'notes-empty', 'notes-list', 'notes-help', 'feedback'].map(id => [id, byId(id)]));
const messages = {
  not_configured: 'De accountomgeving is nog niet verbonden. Er is niets verstuurd.',
  invalid_email: 'Vul een geldig e-mailadres in.', invalid_code: 'Vul de 6 tot 8 cijfers uit je e-mail in.',
  code_request_failed: 'De code kon niet worden aangevraagd. Controleer je adres en probeer later opnieuw. RIO maakt geen nieuw account aan.',
  code_verification_failed: 'Deze code kon niet worden bevestigd. Controleer de code of vraag een nieuwe aan.',
  auth_required: 'Log opnieuw in om je account te gebruiken.', verification_required: 'Je e-mailadres of telefoonnummer moet eerst bevestigd zijn.',
  enrollment_required: 'Je account heeft nog geen actieve persoonlijke PALACO-koppeling. Vraag je beheerder om deze koppeling.',
  authorization_unavailable: 'Je persoonlijke toegang kon niet worden gecontroleerd. Probeer later opnieuw.',
  account_changed: 'Je account of persoonlijke koppeling is veranderd. Log opnieuw in.',
  consent_required: 'Vink aan dat je deze notitie in je RIO-account wilt opslaan.',
  invalid_note: 'Geef je notitie een titel van maximaal 120 tekens en tekst van maximaal 8.000 tekens.',
  note_save_failed: 'Opslaan kon niet worden bevestigd. Je concept is behouden. Probeer dezelfde notitie opnieuw; deze krijgt geen tweede exemplaar.',
  notes_read_failed: 'Je notities konden niet worden opgehaald. Probeer later opnieuw.',
  request_conflict: 'Deze opslagaanvraag hoort bij een andere notitie. Verander je concept en probeer opnieuw.',
  note_limit: 'Je account heeft het maximale aantal notities bereikt. Er is niets toegevoegd.',
  rate_limit: 'Je hebt kort achter elkaar veel notities opgeslagen. Wacht even en probeer opnieuw.',
  invalid_response: 'Het antwoord van de accountomgeving kon niet veilig worden verwerkt. Probeer later opnieuw.',
  signout_required: 'Log eerst uit voordat je een andere inlogcode aanvraagt.',
  signout_unconfirmed: 'Je bent uit dit tabblad uitgelogd. De afmelding bij Supabase kon niet worden bevestigd.',
  request_failed: 'De verbinding is onderbroken. Je concept is behouden. Probeer later opnieuw.',
};
const feedback = text => { ui.feedback.textContent = text; };
let workspace;
let lastUserId = null;
let displayedNotes = '';
function clearDraft() {
  ui['note-title'].value = '';
  ui['note-body'].value = '';
  ui['note-consent'].checked = false;
  workspace?.updateDraft({ title: '', body: '', consent: false });
}
function draft() { return { title: ui['note-title'].value, body: ui['note-body'].value, consent: ui['note-consent'].checked }; }
function render(state) {
  const ready = state.phase === 'ready';
  const canLogin = state.configured && !state.busy && !state.user;
  const identified = Boolean(state.user);
  if (lastUserId && lastUserId !== state.user?.id) clearDraft();
  lastUserId = state.user?.id ?? null;
  ui.connection.dataset.state = ready ? 'ready' : state.configured ? 'available' : 'unavailable';
  ui['connection-label'].textContent = ready ? 'Verbonden met jouw RIO-account' : state.configured ? 'Accountomgeving beschikbaar' : 'Nog niet verbonden';
  ui['connection-detail'].textContent = ready ? 'Je persoonlijke toegang is gecontroleerd. Kies zelf wat je ophaalt of bewaart.'
    : state.configured ? 'Supabase verzorgt het inloggen en bewaren. Log in om je persoonlijke toegang te laten controleren.'
      : 'Er is nog geen Supabase-project ingesteld voor deze preview. Inloggen en opslaan zijn uitgeschakeld.';
  ui['request-form'].hidden = identified;
  ui['verify-form'].hidden = identified || state.phase !== 'code_sent';
  ui['signed-in'].hidden = !identified;
  ui['user-label'].textContent = state.user?.label ?? '';
  ui.email.disabled = !canLogin;
  ui.code.disabled = !canLogin;
  ui['request-code'].disabled = !canLogin;
  ui['verify-code'].disabled = !canLogin;
  // Logging out remains available while a private request is pending.
  ui['sign-out'].disabled = !state.configured;
  for (const name of ['note-title', 'note-body', 'note-consent', 'save-note', 'refresh-notes']) ui[name].disabled = !ready || state.busy;
  ui['notes-help'].textContent = ready ? 'Alleen jij kunt deze notities ophalen. Schrijf een notitie en kies bewust om haar te bewaren.'
    : 'Log in met een gekoppeld account om je eigen notities te bekijken en te bewaren.';
  const serialized = JSON.stringify(state.notes);
  if (displayedNotes !== serialized) {
    displayedNotes = serialized;
    ui['notes-list'].replaceChildren();
    for (const note of state.notes) {
      const item = document.createElement('li'); item.className = 'note';
      const title = document.createElement('h3'); title.textContent = note.title;
      const body = document.createElement('p'); body.textContent = note.body;
      const time = document.createElement('time'); time.dateTime = note.created_at;
      time.textContent = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(note.created_at));
      item.append(title, body, time); ui['notes-list'].append(item);
    }
  }
  ui['notes-empty'].hidden = state.notes.length > 0;
  if (!identified) ui['notes-empty'].textContent = 'Je bewaarde notities verschijnen hier nadat je ze ophaalt.';
  if (state.busy) feedback('Even wachten…');
  else if (state.error) feedback(messages[state.error] || messages.request_failed);
}
async function perform(action, onSuccess) {
  const result = await action();
  if (result.ok) onSuccess?.(result);
  else if (result.error !== 'stale_result' && result.error !== 'busy') feedback(messages[result.error] || messages.request_failed);
  return result;
}
ui['request-form'].addEventListener('submit', event => {
  event.preventDefault();
  if (!workspace) return;
  const email = ui.email.value.trim(); ui.email.value = email;
  perform(() => workspace.requestCode(email), () => {
    feedback('Als je bestaande account voor e-mailcodes is ingericht, ontvang je een code van Supabase. Er wordt geen nieuw account aangemaakt.');
    ui.code.focus();
  });
});
ui['verify-form'].addEventListener('submit', event => {
  event.preventDefault();
  if (!workspace) return;
  perform(() => workspace.verifyCode({ email: ui.email.value.trim(), token: ui.code.value.trim() }), () => {
    ui.code.value = '';
    feedback('Je bent ingelogd. Je kunt nu je eigen notities ophalen of een nieuwe notitie bewaren.');
    ui['note-title'].focus();
  });
});
ui['note-form'].addEventListener('submit', event => {
  event.preventDefault();
  if (!workspace) return;
  const sent = draft();
  perform(() => workspace.saveNote(sent), () => {
    if (JSON.stringify(draft()) === JSON.stringify(sent)) clearDraft();
    feedback('Je notitie is bewaard in je RIO-account.');
    ui['note-title'].focus();
  });
});
for (const name of ['note-title', 'note-body', 'note-consent']) ui[name].addEventListener('input', () => workspace?.updateDraft(draft()));
ui['refresh-notes'].addEventListener('click', () => {
  if (!workspace) return;
  perform(() => workspace.listNotes(), result => {
    ui['notes-empty'].textContent = result.notes.length ? '' : 'Je hebt nog geen notities bewaard.';
    feedback(result.notes.length ? 'Je bewaarde notities zijn opgehaald.' : 'Je hebt nog geen notities bewaard.');
  });
});
ui['sign-out'].addEventListener('click', async () => {
  if (!workspace) return;
  clearDraft(); ui.code.value = ''; ui.email.value = '';
  const result = await workspace.signOut();
  feedback(result.ok ? 'Je bent uit dit tabblad uitgelogd. Je bewaarde notities blijven in je account.' : messages.signout_unconfirmed);
  ui.email.focus();
});

async function initialize() {
  let configuration = { provider: 'supabase', configured: false };
  try {
    const response = await fetch('/api/rio/backend/config', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } });
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) configuration = await response.json();
  } catch { /* The disconnected state is intentional and never invents a session. */ }
  workspace = createRioWorkspace({ configuration });
  workspace.subscribe(render);
}
initialize();
