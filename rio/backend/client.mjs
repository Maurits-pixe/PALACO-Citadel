import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const copy = value => structuredClone(value);
const failure = code => Object.assign(new Error(code), { rioCode: code });
const count = value => [...value].length;

export function validateRioConfiguration(configuration) {
  if (!configuration || configuration.provider !== 'supabase' || configuration.configured !== true) return null;
  if (typeof configuration.url !== 'string' || typeof configuration.publishableKey !== 'string') return null;
  try {
    const url = new URL(configuration.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (!/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(configuration.publishableKey)) return null;
    return { url: url.origin, publishableKey: configuration.publishableKey };
  } catch { return null; }
}

// Tokens stay inside the SDK's isolated, in-memory session. No session is
// imported from RIO, a URL, browser storage, a persona, or another device.
export function createRioWorkspace({ configuration, createClientImpl = createClient } = {}) {
  const config = validateRioConfiguration(configuration);
  const listeners = new Set();
  let epoch = 0;
  let client;
  let subscription;
  let intent = null;
  let draft = { title: '', body: '', consent: false };
  let state = {
    configured: Boolean(config), phase: config ? 'signed_out' : 'not_configured',
    busy: false, error: null, user: null, personId: null, notes: [],
  };
  const snapshot = () => copy(state);
  function publish(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(snapshot());
  }
  function clearPrivate(patch = {}) {
    intent = null;
    draft = { title: '', body: '', consent: false };
    publish({ user: null, personId: null, notes: [], ...patch });
  }
  function makeClient() {
    const next = createClientImpl(config.url, config.publishableKey, {
      auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true },
    });
    subscription?.unsubscribe();
    subscription = next.auth.onAuthStateChange?.((event, session) => {
      if (client !== next) return;
      if (event === 'SIGNED_OUT' || (state.user && session?.user?.id && state.user.id !== session.user.id)) {
        epoch += 1;
        clearPrivate({ phase: 'signed_out', busy: false, error: null });
      }
    })?.data?.subscription;
    return next;
  }
  if (config) client = makeClient();
  const current = ticket => epoch === ticket.epoch && client === ticket.client;
  function check(ticket) { if (!current(ticket)) throw failure('stale_result'); }
  function refuse(ticket, phase, code) {
    check(ticket);
    clearPrivate({ phase });
    throw failure(code);
  }
  async function identity(ticket, expected) {
    const response = await ticket.client.auth.getUser();
    check(ticket);
    const user = response?.data?.user;
    if (response?.error || !user || !UUID.test(user.id ?? '') || user.is_anonymous === true) {
      refuse(ticket, 'signed_out', 'auth_required');
    }
    if (!(user.email && user.email_confirmed_at) && !(user.phone && user.phone_confirmed_at)) {
      refuse(ticket, 'unverified', 'verification_required');
    }
    if (expected?.userId && user.id !== expected.userId) refuse(ticket, 'signed_out', 'account_changed');
    const mapping = await ticket.client.rpc('rio_current_person');
    check(ticket);
    if (mapping?.error) refuse(ticket, 'signed_out', 'authorization_unavailable');
    if (!UUID.test(mapping?.data ?? '')) refuse(ticket, 'enrollment_required', 'enrollment_required');
    if (expected?.personId && mapping.data !== expected.personId) refuse(ticket, 'signed_out', 'account_changed');
    return { user: { id: user.id, label: user.email || user.phone }, personId: mapping.data };
  }
  function rows(data) {
    if (!Array.isArray(data) || data.length > 100) throw failure('invalid_response');
    return data.map(row => {
      if (!UUID.test(row?.id ?? '') || !UUID.test(row?.client_request_id ?? '')
        || typeof row.title !== 'string' || typeof row.body !== 'string'
        || count(row.title) > 120 || count(row.body) > 8000
        || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw failure('invalid_response');
      return { id: row.id, title: row.title, body: row.body, created_at: row.created_at, client_request_id: row.client_request_id };
    });
  }
  async function run(action) {
    if (!client) return { ok: false, error: 'not_configured' };
    if (state.busy) return { ok: false, error: 'busy' };
    const ticket = { epoch, client };
    publish({ busy: true, error: null });
    try {
      const result = await action(ticket);
      check(ticket);
      publish({ busy: false });
      return { ok: true, ...result };
    } catch (error) {
      if (!current(ticket)) return { ok: false, error: 'stale_result' };
      const code = error?.rioCode || 'request_failed';
      publish({ busy: false, error: code });
      return { ok: false, error: code };
    }
  }
  function updateDraft(next) {
    const changed = draft.title !== next.title || draft.body !== next.body || draft.consent !== next.consent;
    if (changed) intent = null;
    draft = { title: next.title, body: next.body, consent: next.consent };
  }
  function expectedIdentity() {
    return state.user && state.personId ? { userId: state.user.id, personId: state.personId } : null;
  }
  const requestCode = email => run(async ticket => {
    if (state.user) throw failure('signout_required');
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('invalid_email');
    const response = await ticket.client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    check(ticket);
    if (response?.error) throw failure('code_request_failed');
    publish({ phase: 'code_sent' });
  });
  const verifyCode = ({ email, token } = {}) => run(async ticket => {
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw failure('invalid_email');
    if (typeof token !== 'string' || !/^\d{6,8}$/.test(token)) throw failure('invalid_code');
    const response = await ticket.client.auth.verifyOtp({ email, token, type: 'email' });
    if (!current(ticket)) {
      // A late OTP belongs to the discarded client, never to the new tab session.
      await ticket.client.auth.signOut({ scope: 'local' }).catch(() => {});
      ticket.client.auth.stopAutoRefresh?.();
      throw failure('stale_result');
    }
    if (response?.error) throw failure('code_verification_failed');
    const verified = await identity(ticket);
    publish({ ...verified, phase: 'ready', notes: [] });
  });
  const refresh = () => run(async ticket => {
    const verified = await identity(ticket, expectedIdentity());
    publish({ ...verified, phase: 'ready' });
  });
  const listNotes = () => run(async ticket => {
    const expected = expectedIdentity();
    if (!expected) throw failure('auth_required');
    await identity(ticket, expected);
    const response = await ticket.client.from('rio_notes')
      .select('id,title,body,created_at,client_request_id').order('created_at', { ascending: false }).limit(100);
    check(ticket);
    if (response?.error) throw failure('notes_read_failed');
    const notes = rows(response.data);
    await identity(ticket, expected);
    publish({ notes });
    return { notes: copy(notes) };
  });
  const saveNote = input => run(async ticket => {
    updateDraft(input ?? {});
    const { title, body, consent } = draft;
    if (consent !== true) throw failure('consent_required');
    if (typeof title !== 'string' || !title.trim() || count(title) > 120
      || typeof body !== 'string' || !body.trim() || count(body) > 8000) throw failure('invalid_note');
    const expected = expectedIdentity();
    if (!expected) throw failure('auth_required');
    await identity(ticket, expected);
    if (!intent) intent = { id: crypto.randomUUID(), ...expected };
    const requestId = intent.id;
    const response = await ticket.client.rpc('rio_create_note', {
      p_client_request_id: requestId, p_title: title, p_body: body, p_consent: true,
    });
    check(ticket);
    if (response?.error) {
      const message = response.error.message;
      const code = { RIO_AUTH_REQUIRED: 'auth_required', RIO_CONSENT_REQUIRED: 'consent_required',
        RIO_INVALID_NOTE: 'invalid_note', RIO_REQUEST_CONFLICT: 'request_conflict',
        RIO_NOTE_LIMIT: 'note_limit', RIO_RATE_LIMIT: 'rate_limit' }[message] || 'note_save_failed';
      if (code === 'auth_required') refuse(ticket, 'signed_out', code);
      throw failure(code);
    }
    const saved = rows(response.data);
    if (saved.length !== 1 || saved[0].client_request_id !== requestId) throw failure('invalid_response');
    await identity(ticket, expected);
    const notes = [saved[0], ...state.notes.filter(note => note.id !== saved[0].id)]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100);
    intent = null;
    publish({ notes });
    return { note: copy(saved[0]) };
  });
  async function signOut() {
    epoch += 1;
    const previous = client;
    clearPrivate({ phase: config ? 'signed_out' : 'not_configured', busy: false, error: null });
    if (!previous) return { ok: true };
    previous.auth.stopAutoRefresh?.();
    client = makeClient();
    try {
      const result = await previous.auth.signOut({ scope: 'local' });
      return result?.error ? { ok: false, error: 'signout_unconfirmed' } : { ok: true };
    } catch { return { ok: false, error: 'signout_unconfirmed' }; }
  }
  return {
    snapshot, subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    requestCode, verifyCode, refresh, listNotes, saveNote, signOut, updateDraft,
  };
}
