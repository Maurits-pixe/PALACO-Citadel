(() => {
 'use strict';
 const seatPattern = /^PALACO-AMB-(0[1-9]|1[0-2])$/;
 const seats = Array.from(document.querySelectorAll('.seat'));
 const statusElement = document.getElementById('access-state');
 const selected = document.getElementById('selected');
 const selectionNote = document.getElementById('selection-note');
 const message = document.getElementById('access-message');
 const login = document.getElementById('sign-in');
 const unavailable = document.getElementById('unavailable');
 const logout = document.getElementById('sign-out');
 const workspace = document.getElementById('workspace');
 let revision = 0;
 let pollTimer;
 const endpoint = path => new URL(path, document.baseURI);
 function chosenSeat() {
  const fragment = location.hash.slice(1);
  const query = new URL(location.href).searchParams.get('seat') || '';
  return seatPattern.test(fragment) ? fragment : seatPattern.test(query) ? query : null;
 }
 function resetAccess() {
  login.hidden = true; login.removeAttribute('href');
  unavailable.hidden = false; logout.hidden = true; workspace.hidden = true;
 }
 function selectSeat(seat) {
  selected.textContent = seat ? 'Toegang voor ' + seat : 'Kies je ambassadepost';
  selectionNote.textContent = seat ? 'Je persoonlijke account moet aan deze zetel zijn gekoppeld.' : 'Kies hieronder de post waarvan je de persoonlijke toegang wilt openen.';
  for (const link of seats) {
   if (seat && link.getAttribute('href') === '#' + seat) link.setAttribute('aria-current', 'true');
   else link.removeAttribute('aria-current');
  }
 }
 async function readJSON(path) {
  const response = await fetch(endpoint(path), {credentials: 'same-origin', cache: 'no-store', headers: {Accept: 'application/json'}});
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
  return response.json();
 }
 async function refresh() {
  const version = ++revision;
  clearTimeout(pollTimer);
  resetAccess();
  const requested = chosenSeat();
  selectSeat(requested);
  statusElement.textContent = 'Inlogstatus controleren…';
  try {
   const status = await readJSON('api/auth/status');
   if (version !== revision) return;
   if (status.configured !== true || status.available !== true) throw new Error('Unavailable');
   const assigned = seatPattern.test(status.seat || '') ? status.seat : null;
   const activeSeat = requested || assigned;
   selectSeat(activeSeat);
   unavailable.hidden = true;
   if (status.authenticated === true && assigned) {
    logout.hidden = false;
    if (activeSeat !== assigned) {
     statusElement.textContent = 'Geen toegang tot deze post';
     message.textContent = 'Je account heeft toegang tot ' + assigned + '. Kies die post om je eigen omgeving te openen.';
    } else {
     const data = await readJSON('api/me');
     if (version !== revision) return;
     if (data.seat !== assigned || data.access !== 'personal-workspace-read-only') throw new Error('Unavailable');
     workspace.hidden = false;
     document.getElementById('workspace-seat').textContent = 'Gekoppelde zetel: ' + data.seat;
     statusElement.textContent = 'Persoonlijk account gecontroleerd';
     message.textContent = 'Je bent ingelogd. De toegang tot je eigen post wordt opnieuw gecontroleerd bij ieder verzoek.';
    }
   } else if (activeSeat) {
    statusElement.textContent = 'Persoonlijke inlog beschikbaar';
    message.textContent = 'Log in met je eigen account. Alleen vooraf gekoppelde accounts krijgen toegang tot hun post.';
    const url = endpoint('login'); url.searchParams.set('seat', activeSeat);
    login.href = url.pathname + url.search; login.hidden = false;
   } else {
    statusElement.textContent = 'Kies eerst je ambassadepost';
    message.textContent = 'De inlogdienst is beschikbaar. Kies hieronder je post om aan te melden.';
   }
  } catch {
   if (version !== revision) return;
   resetAccess();
   statusElement.textContent = 'Persoonlijke toegang momenteel niet beschikbaar';
   message.textContent = 'De inlogdienst of accountcontrole is niet bereikbaar. Probeer het later opnieuw.';
  } finally {
   if (version === revision) pollTimer = setTimeout(refresh, 30000);
  }
 }
 logout.addEventListener('click', async () => {
  const version = ++revision;
  clearTimeout(pollTimer); resetAccess();
  statusElement.textContent = 'Uitloggen…';
  try {
   const response = await fetch(endpoint('logout'), {method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'manual'});
   if (response.type !== 'opaqueredirect' && !response.ok && response.status !== 302 && response.status !== 303) throw new Error('Logout failed');
   if (version === revision) {statusElement.textContent = 'Je sessie is afgesloten'; message.textContent = 'De persoonlijke omgeving is gesloten.';}
  } catch {
   if (version === revision) {statusElement.textContent = 'Uitloggen niet bevestigd'; message.textContent = 'Het afsluiten van de sessie kon niet worden bevestigd. Probeer het opnieuw.'; logout.hidden = false;}
  } finally {if (version === revision) pollTimer = setTimeout(refresh, 1000);}
 });
 window.addEventListener('hashchange', refresh);
 document.addEventListener('visibilitychange', () => {if (!document.hidden) refresh();});
 refresh();
})();