import {existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const output = resolve(root, 'render-dist');
export const PREVIEW_ORIGIN = 'https://palaco-rio-preview-temporary.onrender.com';
export const TRIAL_ORIGIN = 'https://palaco-ambassades.onrender.com';
export const ROOT_ASSETS = Object.freeze(['index.html', 'styles.css', 'app.js', 'sw.js',
  'manifest.webmanifest', 'icon-192.svg', 'icon-512.svg', 'citadel-icon.png', 'rio-engine-web.mjs', 'engine.mjs',
  'chat-preview.mjs', 'integration.mjs']);
export const OUTPUT_FILES = Object.freeze([...ROOT_ASSETS, 'rio/index.html', 'rio/start.js',
  'rio/download', 'rio/sw.js', 'rio/manifest.webmanifest', 'rio/icon-192.png', 'rio/icon-512.png',
  'rio/reception/index.html', 'rio/reception/app.css', 'rio/reception/app.js', 'rio/reception/nova.png']);
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const text = path => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
function replaceOnce(source, needle, replacement) {
  if (!source.includes(needle) || source.indexOf(needle) !== source.lastIndexOf(needle)) throw Error('SOURCE_CONTRACT_CHANGED');
  return source.replace(needle, replacement);
}
function emit(path, content) {
  if (!OUTPUT_FILES.includes(path)) throw Error('OUTPUT_NOT_ALLOWED');
  const target = resolve(output, path);
  if (!target.startsWith(output + sep)) throw Error('OUTPUT_NOT_ALLOWED');
  mkdirSync(dirname(target), {recursive:true});
  if (Buffer.isBuffer(content)) writeFileSync(target, content);
  else writeFileSync(target, content, 'utf8');
}

const navigation = `
(() => {
  const labels = {
    nl: ['RIO · VisitCard', 'NOVA uitgelegd · receptie (Nederlands)'], en: ['RIO · VisitCard', 'NOVA explained · reception (Dutch)'],
    de: ['RIO · VisitCard', 'NOVA erklärt · Empfang (Niederländisch)'], fr: ['RIO · VisitCard', 'NOVA expliquée · accueil (néerlandais)'],
    es: ['RIO · VisitCard', 'NOVA explicada · recepción (neerlandés)'], it: ['RIO · VisitCard', 'NOVA spiegata · accoglienza (olandese)'],
    pt: ['RIO · VisitCard', 'NOVA explicada · receção (neerlandês)'], ru: ['RIO · VisitCard', 'О NOVA · приёмная (нидерландский)'],
    zh: ['RIO · VisitCard', 'NOVA 说明 · 接待（荷兰语）'], ar: ['RIO · VisitCard', 'شرح NOVA · الاستقبال (بالهولندية)'],
    eo: ['RIO · VisitCard', 'NOVA klarigita · akceptejo (nederlande)']
  };
  const update = () => {
    const requested = document.documentElement.lang.split('-')[0];
    const language = Object.hasOwn(labels, requested) ? requested : 'en';
    const copy = labels[language];
    const prefix = location.protocol === 'file:' ? '${PREVIEW_ORIGIN}' : '';
    [['unified-home','/'],['unified-reception','/rio/reception/']].forEach(([id,path],index) => {
      const link = document.getElementById(id);
      link.textContent = copy[index];
      link.href = prefix + path + (index === 1 && !prefix ? '#nova-explained:' + language : '');
      if (prefix) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    });
  };
  new MutationObserver(update).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  update();
})();
`;

export function buildUnifiedPreview() {
  // A fixed generated child only; never follow a symlink or clear source/private directories.
  if (relative(root, output) !== 'render-dist' || realpathSync(dirname(output)) !== root
      || (existsSync(output) && (lstatSync(output).isSymbolicLink() || realpathSync(output) !== output))) throw Error('UNSAFE_OUTPUT_DIRECTORY');
  const originalApp = text('ambassades/rio/palaco-rio-start-v0.1.html');
  const nav = '<nav class="actions" aria-label="PALACO RIO" style="margin:0 0 21px"><a id="unified-home" class="btn outline" href="/">RIO · VisitCard</a><a id="unified-reception" class="btn outline" href="/rio/reception/" hreflang="nl">NOVA uitgelegd · receptie (Nederlands)</a></nav>\n';
  let app = replaceOnce(originalApp, '<div class="actions" style="margin:0 0 21px">', nav + '<div class="actions" style="margin:0 0 21px">');
  app = replaceOnce(app, '</style>', '\n/* Keep enlarged local contact fields within their grid. */\n.contact-grid > *, .contact-grid input {min-width:0}\n</style>');
  const inline = [...app.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (inline.length !== 1) throw Error('SOURCE_CONTRACT_CHANGED');
  let appScript = replaceOnce(inline[0][1], "(isFile?'https://palaco-ambassades.onrender.com':'')", "'" + TRIAL_ORIGIN + "'");
  appScript = replaceOnce(appScript, "const isFile=location.protocol==='file:';\nfunction renderInstall(){", 'function renderInstall(){');
  appScript = replaceOnce(appScript,
    "const getLanguage=()=>{const query=new URLSearchParams(location.search).get('lang');return own(translations,query)?query:'nl';};",
    `const isFile=location.protocol==='file:';
function syncLanguageQuery(next){
 if(isFile)return;
 try{
  const url=new URL(location.href),values=url.searchParams.getAll('lang');
  if(values.length!==1||!own(translations,values[0])||values[0]===next)return;
  url.searchParams.set('lang',next);
  history.replaceState(history.state,'',url);
 }catch{}
}
const getLanguage=()=>{const query=new URLSearchParams(location.search).get('lang');if(own(translations,query))return query;if(!isFile)try{const saved=sessionStorage.getItem('palaco-language');if(own(translations,saved))return saved;}catch{}return 'nl';};`);
  appScript = replaceOnce(appScript,
    "function applyLanguage(next){\n const previous=language;language=own(translations,next)?next:'nl';",
    "function applyLanguage(next){\n const previous=language;language=own(translations,next)?next:'nl';\n if(!isFile)try{sessionStorage.setItem('palaco-language',language);}catch{}\n syncLanguageQuery(language);");
  appScript += navigation;
  const appOnline = replaceOnce(replaceOnce(app, inline[0][0], '<script src="/rio/start.js" defer></script>'),
    '<head>', '<head>\n<link rel="icon" href="/rio/icon-192.png" type="image/png">');
  const appDownload = replaceOnce(app, inline[0][0], '<script>' + appScript + '</script>');
  if (Buffer.byteLength(appDownload) >= 100 * 1024) throw Error('DOWNLOAD_TOO_LARGE');
  let appWorker = replaceOnce(text('ambassades/rio/sw.js'), 'palaco-rio-start-v0.1-3', 'palaco-rio-start-v0.1-8');
  appWorker = replaceOnce(appWorker, "const ASSETS=['/rio/','/rio/manifest.webmanifest','/rio/icon-192.png','/rio/icon-512.png'];", "const ASSETS=['/rio/','/rio/start.js','/rio/manifest.webmanifest','/rio/icon-192.png','/rio/icon-512.png'];");
  let reception = replaceOnce(text('ambassades/rio/reception/index.html'), '<html lang="nl">', '<html lang="nl" data-runtime-mode="static-preview">');
  reception = replaceOnce(reception, '<head>', '<head>\n  <link rel="icon" href="/icon-192.svg" type="image/svg+xml">');
  reception = replaceOnce(reception, '<a class="brand" href="/rio/"', '<a class="brand" href="/"');
  for (const [id, style, route, alreadyOpensTab] of [
    ['start-device-test', 'primary', 'device-test', false], ['start-nova', 'secondary', 'nova', false],
    ['nova-guide-device', 'secondary', 'device-test', true], ['nova-guide-reception', 'secondary', 'nova', true],
  ]) {
    const prefix = '<a id="' + id + '" class="button button-' + style + '" href="';
    reception = replaceOnce(reception, prefix + '/rio/' + route + '/"', prefix + TRIAL_ORIGIN + '/rio/' + route + '/"' + (alreadyOpensTab ? '' : ' target="_blank" rel="noopener noreferrer"'));
  }
  reception = replaceOnce(reception, 'id="nova-trial-destination" class="nova-language-scope" hidden', 'id="nova-trial-destination" class="nova-language-scope"');
  reception = replaceOnce(reception, 'Zet JavaScript aan om hier de bereikbaarheid te controleren.', 'Deze preview meet de bereikbaarheid niet; de proeven openen op de beveiligde proefserver.');
  if (existsSync(output)) rmSync(output, {recursive:true,force:true});
  mkdirSync(output, {recursive:true});
  for (const file of ROOT_ASSETS) emit(file, file === 'citadel-icon.png'
    ? readFileSync(resolve(root, 'ambassades/rio/visitcard/' + file)) : text('ambassades/rio/visitcard/' + file));
  emit('rio/index.html', appOnline); emit('rio/start.js', appScript); emit('rio/download', appDownload); emit('rio/sw.js', appWorker);
  for (const file of ['manifest.webmanifest','icon-192.png','icon-512.png']) emit('rio/'+file, readFileSync(resolve(root,'ambassades/rio/'+file)));
  emit('rio/reception/index.html', reception);
  for (const file of ['app.css','app.js','nova.png']) emit('rio/reception/'+file, readFileSync(resolve(root,'ambassades/rio/reception/'+file)));
  const files = OUTPUT_FILES.map(path => {const bytes=readFileSync(resolve(output,path));return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};});
  const record={schemaVersion:'palaco-rio-unified-preview-build/0.1',mode:'STATIC_PREVIEW',previewOrigin:PREVIEW_ORIGIN,trialOrigin:TRIAL_ORIGIN,
    sources:{visitcard:'efda74f0b8f2e91bd694c770564d29ca669ab846',rio:'3a1c67551ef4925728e1c136fcdef001e653df27'},
    onlineInlineScripts:false,downloadInlineScripts:true,backendPublished:false,accountActive:false,canOpenContact:false,operativeAuthority:'NONE',csp:CSP,files};
  const recordPath=resolve(root,'artifacts/rio-unified-preview-build.json');mkdirSync(dirname(recordPath),{recursive:true});writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n');
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const record=buildUnifiedPreview(); console.log('Prepared '+record.files.length+' explicit public files for the unified static RIO preview. No deploy performed.');
}
