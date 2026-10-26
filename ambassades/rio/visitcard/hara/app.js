const routes = new Set(['citadel', 'architecture', 'provenance', 'elixers']);
function openGuide(id, moveFocus = true) {
  if (!routes.has(id)) return;
  const panel = document.getElementById(id);
  if (!(panel instanceof HTMLDetailsElement)) return;
  panel.open = true;
  panel.scrollIntoView({block: 'start', behavior: 'auto'});
  if (moveFocus) panel.querySelector('summary')?.focus({preventScroll: true});
}
document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[data-guide]') : null;
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = link.getAttribute('href');
  if (!href || !href.startsWith('#') || !routes.has(href.slice(1))) return;
  event.preventDefault();
  openGuide(href.slice(1));
});
window.addEventListener('hashchange', () => openGuide(location.hash.slice(1)));
if (routes.has(location.hash.slice(1))) openGuide(location.hash.slice(1));
