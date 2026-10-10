(() => {
 'use strict';
 const languages = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ar', 'eo'];
 const normalize = value => value.replace(/\s+/g, ' ').trim();
 const selector = document.getElementById('language');
 const panel = document.querySelector('.language-picker');
 let catalogs;
 let active = 'nl';
 let sourceKeys = new Map();
 let textEntries = [];
 let attributeEntries = [];
 let linkEntries = [];
 const storedLanguage = () => { try { return localStorage.getItem('palaco-language'); } catch { return null; } };
 const requestedLanguage = () => {
  const fromURL = new URL(location.href).searchParams.get('lang');
  return languages.includes(fromURL) ? fromURL : languages.includes(storedLanguage()) ? storedLanguage() : 'nl';
 };
 function text(source, values = {}) {
  const key = sourceKeys.get(normalize(source));
  const translated = key ? catalogs?.[active]?.[key] || catalogs?.nl?.[key] || source : source;
  return translated.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? (active === 'ar' && name === 'seat' ? '\u2068' + String(values[name]) + '\u2069' : String(values[name])) : match);
 }
 function snapshot() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
   const node = walker.currentNode;
   if (node.parentElement?.closest('script,style,noscript')) continue;
   const value = node.nodeValue;
   const key = sourceKeys.get(normalize(value));
   if (!key) continue;
   textEntries.push({node, key, before: /^\s*/.exec(value)[0], after: /\s*$/.exec(value)[0]});
  }
  for (const element of document.querySelectorAll('[aria-label],[placeholder],meta[name="description"]')) {
   for (const attribute of ['aria-label', 'placeholder', ...(element.matches('meta[name="description"]') ? ['content'] : [])]) {
    const value = element.getAttribute(attribute);
    const key = value && sourceKeys.get(normalize(value));
    if (key) attributeEntries.push({element, attribute, key});
   }
  }
  for (const element of document.querySelectorAll('a[href]')) {
   const href = element.getAttribute('href');
   if (!href || href.startsWith('#')) continue;
   const url = new URL(href, document.baseURI);
   if (url.origin === location.origin && (/\/(index|toegang)\.html$/.test(url.pathname) || url.pathname === '/rio/')) linkEntries.push({element, href});
  }
 }
 function apply(language, updateURL = false) {
  if (!catalogs || !languages.includes(language)) return;
  active = language;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  for (const entry of textEntries) entry.node.nodeValue = entry.before + catalogs[language][entry.key] + entry.after;
  for (const entry of attributeEntries) entry.element.setAttribute(entry.attribute, catalogs[language][entry.key]);
  for (const entry of linkEntries) {
   const url = new URL(entry.href, document.baseURI);
   url.searchParams.set('lang', language);
   entry.element.setAttribute('href', url.pathname + url.search + url.hash);
  }
  selector.value = language;
  try { localStorage.setItem('palaco-language', language); } catch {}
  if (updateURL) {
   const url = new URL(location.href);
   url.searchParams.set('lang', language);
   try { history.replaceState(null, '', url.pathname + url.search + url.hash); } catch {}
  }
  window.dispatchEvent(new CustomEvent('palaco:languagechange', {detail: {language}}));
 }
 async function initialize() {
  try {
   const response = await fetch(new URL('locales.json', document.baseURI), {credentials:'same-origin', cache:'no-store'});
   if (!response.ok) throw new Error('Translations unavailable');
   const data = await response.json();
   const keys = Object.keys(data.nl || {});
   if (!keys.length || languages.some(language => !data[language] || keys.some(key => typeof data[language][key] !== 'string' || !data[language][key]))) throw new Error('Incomplete translations');
   catalogs = data;
   sourceKeys = new Map(keys.map(key => [normalize(data.nl[key]), key]));
   snapshot();
   selector.addEventListener('change', () => apply(selector.value, true));
   window.addEventListener('popstate', () => apply(requestedLanguage()));
   panel.hidden = false;
   apply(requestedLanguage());
   return true;
  } catch {
   // The complete Dutch documents remain readable when translation data is unavailable.
   return false;
  }
 }
 window.PalacoI18n = {text, get language() {return active;}, ready: null};
 window.PalacoI18n.ready = initialize();
})();
