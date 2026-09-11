const languageButtons = document.querySelectorAll('.lang-btn');
const syncBtn = document.querySelector('#sync-btn');
const syncOutput = document.querySelector('#sync-output');
const githubStatus = document.querySelector('#github-status');
const repoSearch = document.querySelector('#repo-search');
const heroStats = document.querySelector('#hero-stats');
const overviewGrid = document.querySelector('#overview-grid');
const spotlightGrid = document.querySelector('#spotlight-grid');
const hubGrid = document.querySelector('#hub-grid');
const canonGrid = document.querySelector('#canon-grid');
const emeraldGrid = document.querySelector('#emerald-grid');
const repoGrid = document.querySelector('#repo-grid');

const ACCOUNT_NAME = 'Maurits-pixe';
const CONTENT_REPOSITORY = 'Maurits-pixe/PALACO-Citadel';
const CONTENT_REPOSITORY_ROOT = `https://github.com/${CONTENT_REPOSITORY}/blob/main/`;
const REPO_CACHE_KEY = 'palaco-github-cache-v1';
const LAST_SYNC_KEY = 'palaco-last-sync';
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;
const {
  getRepositoryStatusCount,
  normalizeRepositoryPayload,
  shouldReuseRefresh
} = window.PalacoAppLogic;

const translations = {
  en: {
    eyebrow: 'GO · Maurits-pixe · PALACO Universe',
    heroKicker: 'A working website for the PALACO GitHub universe.',
    heroTitle: 'PALACO Universe Portal',
    heroSubtitle: 'Explore the Citadel structure, Emerald canon, and Maurits-pixe repositories from one live GitHub-powered front door.',
    syncNow: 'Sync now',
    overviewTitle: 'What this site does',
    overviewSubtitle: 'One responsive surface that combines PALACO-Citadel content with live GitHub repository data.',
    contentTitle: 'Content spotlight',
    contentSubtitle: 'Direct excerpts from the repository canon so the homepage shows the content itself, not only navigation.',
    hubsTitle: 'Featured GitHub hubs',
    hubsSubtitle: 'Direct routes to the main PALACO repositories and the current Citadel portal.',
    citadelTitle: 'Citadel reading map',
    citadelSubtitle: 'The canonical route through the current repository.',
    emeraldTitle: 'Emerald system',
    emeraldSubtitle: 'Key Emerald entry points, governance, generation, and extended GO documents.',
    repoTitle: 'Maurits-pixe repository explorer',
    repoSubtitle: 'Loads public repositories live from GitHub and falls back to curated PALACO links when needed.',
    repoSearchLabel: 'Search repositories',
    repoSearchPlaceholder: 'Type a repository name',
    footer: 'PALACO Universe Portal · Citadel content + Emerald structure + live GitHub discovery.',
    statLayers: 'canonical lanes',
    statEmerald: 'Emerald entry points',
    statRepos: 'public repos loaded',
    cardOpen: 'Open',
    cardUpdated: 'Updated',
    cardLanguage: 'Language',
    cardIssues: 'Open issues',
    cardStars: 'Stars',
    cacheStatusLive: 'Live GitHub data loaded.',
    cacheStatusCached: 'GitHub is unavailable right now; showing the latest cached repository data.',
    cacheStatusFallback: 'GitHub is unavailable right now; showing curated PALACO hubs.',
    cacheStatusEmpty: 'No repositories matched your search.',
    lastSync: 'Last sync:',
    syncing: 'Syncing GitHub repositories…',
    liveCount: 'Public repositories currently visible:',
    filteredCount: 'Repositories visible for this search:',
    privateNote: 'Public GitHub data only; direct hub links remain available for other PALACO spaces.',
    contentLoading: 'Loading repository excerpts…',
    contentFallback: 'Repository excerpts are unavailable right now; showing curated summaries.',
    langEn: 'English',
    langNl: 'Dutch',
    langEo: 'Esperanto'
  },
  nl: {
    eyebrow: 'GO · Maurits-pixe · PALACO Universum',
    heroKicker: 'Een werkende website voor het PALACO GitHub-universum.',
    heroTitle: 'PALACO Universe Portal',
    heroSubtitle: 'Verken de Citadel-structuur, de Emerald-canon en Maurits-pixe repositories vanuit één live GitHub-voordeur.',
    syncNow: 'Nu synchroniseren',
    overviewTitle: 'Wat deze site doet',
    overviewSubtitle: 'Één responsive surface die PALACO-Citadel-content combineert met live GitHub repository-data.',
    contentTitle: 'Content spotlight',
    contentSubtitle: 'Directe fragmenten uit de repository-canon zodat de homepage de content zelf toont, niet alleen navigatie.',
    hubsTitle: 'Uitgelichte GitHub-hubs',
    hubsSubtitle: 'Directe routes naar de belangrijkste PALACO-repositories en het huidige Citadel-portaal.',
    citadelTitle: 'Citadel leeskaart',
    citadelSubtitle: 'De canonieke route door de huidige repository.',
    emeraldTitle: 'Emerald-systeem',
    emeraldSubtitle: 'Belangrijke Emerald-ingangen, governance, generatie en uitgebreide GO-documenten.',
    repoTitle: 'Maurits-pixe repository-verkenner',
    repoSubtitle: 'Laadt publieke repositories live vanaf GitHub en valt terug op PALACO-links als dat nodig is.',
    repoSearchLabel: 'Zoek repositories',
    repoSearchPlaceholder: 'Typ een repositorynaam',
    footer: 'PALACO Universe Portal · Citadel-content + Emerald-structuur + live GitHub-ontdekking.',
    statLayers: 'canonieke lagen',
    statEmerald: 'Emerald-ingangen',
    statRepos: 'geladen publieke repos',
    cardOpen: 'Open',
    cardUpdated: 'Bijgewerkt',
    cardLanguage: 'Taal',
    cardIssues: 'Open issues',
    cardStars: 'Stars',
    cacheStatusLive: 'Live GitHub-data geladen.',
    cacheStatusCached: 'GitHub is nu niet beschikbaar; de laatst gecachete repository-data wordt getoond.',
    cacheStatusFallback: 'GitHub is nu niet beschikbaar; uitgelichte PALACO-hubs worden getoond.',
    cacheStatusEmpty: 'Geen repositories gevonden voor je zoekopdracht.',
    lastSync: 'Laatste sync:',
    syncing: 'GitHub repositories worden gesynchroniseerd…',
    liveCount: 'Publieke repositories momenteel zichtbaar:',
    filteredCount: 'Repositories zichtbaar voor deze zoekopdracht:',
    privateNote: 'Alleen publieke GitHub-data; directe hub-links blijven beschikbaar voor andere PALACO-ruimtes.',
    contentLoading: 'Repository-fragmenten worden geladen…',
    contentFallback: 'Repository-fragmenten zijn nu niet beschikbaar; samengestelde samenvattingen worden getoond.',
    langEn: 'Engels',
    langNl: 'Nederlands',
    langEo: 'Esperanto'
  },
  eo: {
    eyebrow: 'GO · Maurits-pixe · PALACO Universo',
    heroKicker: 'Funkcianta retejo por la PALACO GitHub-universo.',
    heroTitle: 'PALACO Universe Portal',
    heroSubtitle: 'Esploru la Citadel-strukturon, la Smeraldan kanonon kaj la deponejojn de Maurits-pixe el unu viva GitHub-enirpordo.',
    syncNow: 'Sinkronigi nun',
    overviewTitle: 'Kion ĉi tiu retejo faras',
    overviewSubtitle: 'Unu respondema surfaco kiu kunigas PALACO-Citadel-enhavon kun viva GitHub-deponeja datumo.',
    contentTitle: 'Enhava fokuso',
    contentSubtitle: 'Rektaj eltiraĵoj el la deponeja kanono por ke la hejmpaĝo montru la enhavon mem, ne nur navigadon.',
    hubsTitle: 'Elstaraj GitHub-nodoj',
    hubsSubtitle: 'Rektaj vojoj al la ĉefaj PALACO-deponejoj kaj la nuna Citadel-portalo.',
    citadelTitle: 'Citadel-legomapo',
    citadelSubtitle: 'La kanona vojo tra la nuna deponejo.',
    emeraldTitle: 'Smeralda sistemo',
    emeraldSubtitle: 'Ĉefaj Smeraldaj enirejoj, administrado, generado, kaj plilongigitaj GO-dokumentoj.',
    repoTitle: 'Deponeja esplorilo de Maurits-pixe',
    repoSubtitle: 'Ŝargas publikajn deponejojn vive el GitHub kaj uzas rezervajn PALACO-ligilojn kiam necese.',
    repoSearchLabel: 'Serĉi deponejojn',
    repoSearchPlaceholder: 'Tajpu deponejan nomon',
    footer: 'PALACO Universe Portal · Citadel-enhavo + Smeralda strukturo + viva GitHub-malkovrado.',
    statLayers: 'kanonaj tavoloj',
    statEmerald: 'Smeraldaj enirejoj',
    statRepos: 'ŝargitaj publikaj deponejoj',
    cardOpen: 'Malfermi',
    cardUpdated: 'Ĝisdatigita',
    cardLanguage: 'Lingvo',
    cardIssues: 'Malfermitaj temoj',
    cardStars: 'Steloj',
    cacheStatusLive: 'Viva GitHub-datumo ŝargita.',
    cacheStatusCached: 'GitHub nun ne disponeblas; montriĝas la plej lasta kaŝmemora deponeja datumo.',
    cacheStatusFallback: 'GitHub nun ne disponeblas; montriĝas elektitaj PALACO-nodoj.',
    cacheStatusEmpty: 'Neniu deponejo kongruas kun via serĉo.',
    lastSync: 'Lasta sinkronigo:',
    syncing: 'GitHub-deponejoj sinkroniĝas…',
    liveCount: 'Publikaj deponejoj nun videblaj:',
    filteredCount: 'Deponejoj videblaj por ĉi tiu serĉo:',
    privateNote: 'Nur publika GitHub-datumo; rektaj nodaj ligiloj restas disponeblaj por aliaj PALACO-spacoj.',
    contentLoading: 'Deponejaj eltiraĵoj ŝargiĝas…',
    contentFallback: 'Deponejaj eltiraĵoj nun ne disponeblas; montriĝas kuracitaj resumoj.',
    langEn: 'Angla',
    langNl: 'Nederlanda',
    langEo: 'Esperanto'
  }
};

const content = {
  en: {
    overview: [
      {
        title: 'Live GitHub front door',
        body: 'The portal loads Maurits-pixe public repositories directly from GitHub and keeps a local fallback cache for continuity.'
      },
      {
        title: 'Citadel content map',
        body: 'The layered PALACO-Citadel canon is turned into a browsable reading route instead of a loose file list.'
      },
      {
        title: 'Emerald access point',
        body: 'The Emerald workspace and GO-EMERALD series are grouped into one visible system for governance, schemas, and generation.'
      }
    ],
    hubs: [
      {
        title: 'PALACO-Citadel',
        body: 'This repository: the layered Citadel portal and current website front door.',
        href: 'https://github.com/Maurits-pixe/PALACO-Citadel'
      },
      {
        title: 'PALACO',
        body: 'Main PALACO repository and broader canonical development stream.',
        href: 'https://github.com/Maurits-pixe/PALACO'
      },
      {
        title: 'PALACO Industrie',
        body: 'Industrial branch and production-oriented PALACO space.',
        href: 'https://github.com/Maurits-pixe/PALACO-INDUSTRIE'
      },
      {
        title: 'PALACO Genesis',
        body: 'Genesis-oriented PALACO hub for origin and early-formation tracks.',
        href: 'https://github.com/Maurits-pixe/palaco-genesis'
      }
    ],
    canon: [
      ['01-FOUNDATION', '01-FOUNDATION/README.md', 'Constitutional principles and authority.'],
      ['02-CORE-SYSTEMS', '02-CORE-SYSTEMS/README.md', 'CITADEL, QUAY, AUDIT, REPLAY, and sealing.'],
      ['03-EVIDENCE', '03-EVIDENCE/README.md', 'Proof, verification, and evidentiary structure.'],
      ['04-GOVERNANCE', '04-GOVERNANCE/README.md', 'Rules of change, custody, and evolution boundaries.'],
      ['05-OPERATIONS', '05-OPERATIONS/README.md', 'Deployment, federation, and operational protocol.'],
      ['06-INTELLIGENCE', '06-INTELLIGENCE/README.md', 'Governed intelligence and decision frameworks.'],
      ['07-IMMORTALITY', '07-IMMORTALITY/README.md', 'Certification, continuity, and OMEGA components.'],
      ['08-IMPLEMENTATION', '08-IMPLEMENTATION/README.md', 'Code, schemas, tests, and examples.'],
      ['DOCS', 'DOCS/README.md', 'Glossary, FAQ, and status reference.']
    ],
    emerald: [
      ['emerald/README', 'emerald/README.md', 'Consolidated Emerald reading order and workspace structure.'],
      ['EMERALD-IMPERIUM-001', 'EMERALD-IMPERIUM-001.md', 'Domain identity and authority boundary.'],
      ['GO-EMERALD-010', 'GO-EMERALD-010.md', 'Emerald constitution and article baseline.'],
      ['GO-EMERALD-009', 'GO-EMERALD-009.md', 'Mineral World Factory and fail-closed gates.'],
      ['GO-EMERALD-036', 'GO-EMERALD-036.md', 'Personal device constellation extension.']
    ]
  },
  nl: {
    overview: [
      {
        title: 'Live GitHub-voordeur',
        body: 'Het portaal laadt publieke Maurits-pixe repositories direct vanaf GitHub en bewaart een lokale fallback-cache voor continuïteit.'
      },
      {
        title: 'Citadel-contentkaart',
        body: 'De gelaagde PALACO-Citadel-canon wordt omgezet in een browsebare leesroute in plaats van een losse bestandslijst.'
      },
      {
        title: 'Emerald-ingang',
        body: 'De Emerald-workspace en GO-EMERALD-serie zijn gegroepeerd tot één zichtbaar systeem voor governance, schema’s en generatie.'
      }
    ],
    hubs: [
      {
        title: 'PALACO-Citadel',
        body: 'Deze repository: het gelaagde Citadel-portaal en de huidige website-voordeur.',
        href: 'https://github.com/Maurits-pixe/PALACO-Citadel'
      },
      {
        title: 'PALACO',
        body: 'Hoofdrepository van PALACO en de bredere canonieke ontwikkelstroom.',
        href: 'https://github.com/Maurits-pixe/PALACO'
      },
      {
        title: 'PALACO Industrie',
        body: 'Industriële tak en productiegerichte PALACO-ruimte.',
        href: 'https://github.com/Maurits-pixe/PALACO-INDUSTRIE'
      },
      {
        title: 'PALACO Genesis',
        body: 'Genesisgerichte PALACO-hub voor oorsprong en vroege vormingssporen.',
        href: 'https://github.com/Maurits-pixe/palaco-genesis'
      }
    ],
    canon: [
      ['01-FOUNDATION', '01-FOUNDATION/README.md', 'Constitutionele principes en authority.'],
      ['02-CORE-SYSTEMS', '02-CORE-SYSTEMS/README.md', 'CITADEL, QUAY, AUDIT, REPLAY en sealing.'],
      ['03-EVIDENCE', '03-EVIDENCE/README.md', 'Bewijs, verificatie en evidentiële structuur.'],
      ['04-GOVERNANCE', '04-GOVERNANCE/README.md', 'Regels van verandering, custody en evolutiegrenzen.'],
      ['05-OPERATIONS', '05-OPERATIONS/README.md', 'Deployment, federatie en operationeel protocol.'],
      ['06-INTELLIGENCE', '06-INTELLIGENCE/README.md', 'Governed intelligence en besliskaders.'],
      ['07-IMMORTALITY', '07-IMMORTALITY/README.md', 'Certificering, continuïteit en OMEGA-componenten.'],
      ['08-IMPLEMENTATION', '08-IMPLEMENTATION/README.md', 'Code, schema’s, tests en voorbeelden.'],
      ['DOCS', 'DOCS/README.md', 'Glossary, FAQ en statusreferentie.']
    ],
    emerald: [
      ['emerald/README', 'emerald/README.md', 'Geconsolideerde Emerald-leesvolgorde en workspacestructuur.'],
      ['EMERALD-IMPERIUM-001', 'EMERALD-IMPERIUM-001.md', 'Domeinidentiteit en authority-grens.'],
      ['GO-EMERALD-010', 'GO-EMERALD-010.md', 'Emerald-grondwet en artikelbasis.'],
      ['GO-EMERALD-009', 'GO-EMERALD-009.md', 'Mineral World Factory en fail-closed gates.'],
      ['GO-EMERALD-036', 'GO-EMERALD-036.md', 'Personal device constellation-uitbreiding.']
    ]
  },
  eo: {
    overview: [
      {
        title: 'Viva GitHub-enirpordo',
        body: 'La portalo ŝargas publikajn deponejojn de Maurits-pixe rekte el GitHub kaj konservas lokan rezervan kaŝmemoron por kontinueco.'
      },
      {
        title: 'Citadel-enhava mapo',
        body: 'La tavoligita PALACO-Citadel-kanono fariĝas trarigardebla legovojo anstataŭ malligita dosierlisto.'
      },
      {
        title: 'Smeralda enirejo',
        body: 'La Smeralda laborspaco kaj GO-EMERALD-serio estas grupigitaj kiel unu videbla sistemo por administrado, skemoj, kaj generado.'
      }
    ],
    hubs: [
      {
        title: 'PALACO-Citadel',
        body: 'Ĉi tiu deponejo: la tavoligita Citadel-portalo kaj nuna reteja enirpordo.',
        href: 'https://github.com/Maurits-pixe/PALACO-Citadel'
      },
      {
        title: 'PALACO',
        body: 'Ĉefa PALACO-deponejo kaj la pli vasta kanona evoluofluo.',
        href: 'https://github.com/Maurits-pixe/PALACO'
      },
      {
        title: 'PALACO Industrie',
        body: 'Industria branĉo kaj produktada PALACO-spaco.',
        href: 'https://github.com/Maurits-pixe/PALACO-INDUSTRIE'
      },
      {
        title: 'PALACO Genesis',
        body: 'Genesis-orientita PALACO-nodo por originaj kaj fruformaj trakoj.',
        href: 'https://github.com/Maurits-pixe/palaco-genesis'
      }
    ],
    canon: [
      ['01-FOUNDATION', '01-FOUNDATION/README.md', 'Konstituciaj principoj kaj aŭtoritato.'],
      ['02-CORE-SYSTEMS', '02-CORE-SYSTEMS/README.md', 'CITADEL, QUAY, AUDIT, REPLAY, kaj sigelado.'],
      ['03-EVIDENCE', '03-EVIDENCE/README.md', 'Pruvo, konfirmo, kaj evidenta strukturo.'],
      ['04-GOVERNANCE', '04-GOVERNANCE/README.md', 'Reguloj de ŝanĝo, gardado, kaj evoluaj limoj.'],
      ['05-OPERATIONS', '05-OPERATIONS/README.md', 'Deplojo, federacio, kaj operacia protokolo.'],
      ['06-INTELLIGENCE', '06-INTELLIGENCE/README.md', 'Regata inteligenteco kaj decidaj kadroj.'],
      ['07-IMMORTALITY', '07-IMMORTALITY/README.md', 'Atestado, kontinueco, kaj OMEGA-partoj.'],
      ['08-IMPLEMENTATION', '08-IMPLEMENTATION/README.md', 'Kodo, skemoj, testoj, kaj ekzemploj.'],
      ['DOCS', 'DOCS/README.md', 'Terminaro, oftaj demandoj, kaj stato-referenco.']
    ],
    emerald: [
      ['emerald/README', 'emerald/README.md', 'Kunigita Smeralda legordo kaj laborspaca strukturo.'],
      ['EMERALD-IMPERIUM-001', 'EMERALD-IMPERIUM-001.md', 'Domajna identeco kaj aŭtoritata limo.'],
      ['GO-EMERALD-010', 'GO-EMERALD-010.md', 'Smeralda konstitucio kaj artikola bazo.'],
      ['GO-EMERALD-009', 'GO-EMERALD-009.md', 'Minerala Monda Fabriko kaj fiasko-fermitaj pordegoj.'],
      ['GO-EMERALD-036', 'GO-EMERALD-036.md', 'Etendo pri persona aparata konstelacio.']
    ]
  }
};

const fallbackRepos = [
  {
    name: 'PALACO-Citadel',
    html_url: 'https://github.com/Maurits-pixe/PALACO-Citadel',
    description: 'Current repository and website portal.',
    language: 'JavaScript',
    stargazers_count: 0,
    open_issues_count: 1,
    updated_at: '2026-09-11T11:55:14Z'
  },
  {
    name: 'PALACO',
    html_url: 'https://github.com/Maurits-pixe/PALACO',
    description: 'Main PALACO repository.',
    language: 'Markdown',
    stargazers_count: 1,
    open_issues_count: 20,
    updated_at: '2026-09-10T19:39:52Z'
  },
  {
    name: 'PALACO-INDUSTRIE',
    html_url: 'https://github.com/Maurits-pixe/PALACO-INDUSTRIE',
    description: 'Featured PALACO industrial hub.',
    language: '—',
    stargazers_count: 0,
    open_issues_count: 0,
    updated_at: '2026-09-01T00:00:00Z'
  },
  {
    name: 'palaco-genesis',
    html_url: 'https://github.com/Maurits-pixe/palaco-genesis',
    description: 'Featured PALACO genesis hub.',
    language: '—',
    stargazers_count: 0,
    open_issues_count: 0,
    updated_at: '2026-09-01T00:00:00Z'
  }
];

const contentSources = [
  {
    path: 'CANONIEKE_FORMULE.md',
    fallbackTitle: 'CANONIEKE FORMULE',
    fallbackBody:
      'geen autoriteit zonder constitutie, geen uitvoering zonder toelating, geen gevolg zonder bewijs, geen bewijs zonder provenance, geen evolutie zonder governance.'
  },
  {
    path: '01-FOUNDATION/README.md',
    fallbackTitle: '01-FOUNDATION',
    fallbackBody: 'Constitutional principles, source authority, and legitimacy boundaries.'
  },
  {
    path: '04-GOVERNANCE/README.md',
    fallbackTitle: '04-GOVERNANCE',
    fallbackBody: 'Rules of change, custody constraints, and constitutional evolution controls.'
  },
  {
    path: 'emerald/README.md',
    fallbackTitle: 'Emerald Registry Workspace',
    fallbackBody:
      'Consolidated access point for the Emerald document set, registry workspace, schemas, release artifacts, and identity-gated generation model.'
  },
  {
    path: 'GO-EMERALD-010.md',
    fallbackTitle: '∆ GO-EMERALD-010 — THE EMERALD CONSTITUTION',
    fallbackBody:
      'The Emerald Imperium is a constitutionally governed world-domain for mineral identity, provenance, history, exploration, and expansion.'
  },
  {
    path: 'GO-EMERALD-009.md',
    fallbackTitle: 'GO-EMERALD-009 — THE MINERAL WORLD FACTORY',
    fallbackBody:
      'Defines Emerald Registry as a controlled generative system that reproduces PALACO world objects from validated IMA-CNMNC source records.'
  },
  {
    path: 'GO-EMERALD-025.md',
    fallbackTitle: 'GO-EMERALD-025 — RIO INTERSTELLAR CONVERSATIONAL ARCHITECTURE',
    fallbackBody:
      'The consumer should understand how to operate the platform within 2 minutes; complexity stays behind RIO until it becomes materially relevant.'
  }
];

let currentLanguage = localStorage.getItem('palaco-language') || 'en';
let repoState = {
  repos: [],
  source: 'fallback'
};
let contentState = {
  items: contentSources.map((source) => ({
    ...source,
    title: source.fallbackTitle,
    body: source.fallbackBody
  })),
  source: 'fallback'
};
let liveRefreshInFlight = null;
let liveRefreshMode = 'idle';

const getLocale = () => {
  if (currentLanguage === 'nl') return 'nl-NL';
  if (currentLanguage === 'eo') return 'eo';
  return 'en-US';
};

const formatDateTime = (value) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const createCard = (tagName, className) => {
  const el = document.createElement(tagName);
  el.className = className;
  return el;
};

const createTextElement = (tagName, text, className = '') => {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  el.textContent = text;
  return el;
};

const cleanMarkdownLine = (line) =>
  line
    .replace(/^#+\s*/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

const setExternalLink = (anchor, href, newTab = true) => {
  try {
    const url = new URL(href, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid protocol');
    anchor.href = url.href;
  } catch {
    anchor.href = '#';
  }
  if (newTab) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
};

const setContentLink = (anchor, path) => {
  const normalizedPath = path.replace(/^\//, '');
  setExternalLink(anchor, `${CONTENT_REPOSITORY_ROOT}${normalizedPath}`);
};

const renderHeroStats = () => {
  if (!heroStats) return;
  const stats = [
    ['08', translations[currentLanguage].statLayers],
    [String(content[currentLanguage].emerald.length), translations[currentLanguage].statEmerald],
    [String(repoState.repos.length), translations[currentLanguage].statRepos]
  ];

  heroStats.replaceChildren(...stats.map(([value, label]) => {
    const card = createCard('li', 'stat-card');
    card.append(createTextElement('strong', value), createTextElement('span', label));
    return card;
  }));
};

const renderOverview = () => {
  if (!overviewGrid) return;
  overviewGrid.replaceChildren(
    ...content[currentLanguage].overview.map((item) => {
      const card = createCard('article', 'card info-card');
      card.append(createTextElement('h3', item.title), createTextElement('p', item.body));
      return card;
    })
  );
};

const renderSpotlights = () => {
  if (!spotlightGrid) return;

  spotlightGrid.replaceChildren(
    ...contentState.items.map((item) => {
      const card = createCard('article', 'card spotlight-card');
      card.append(
        createTextElement('p', item.path, 'spotlight-path'),
        createTextElement('h3', item.title),
        createTextElement('p', item.body, 'spotlight-body')
      );
      const link = createTextElement('a', translations[currentLanguage].cardOpen, 'card-link');
      setContentLink(link, item.path);
      card.append(link);
      return card;
    })
  );
};

const renderHubs = () => {
  if (!hubGrid) return;
  hubGrid.replaceChildren(
    ...content[currentLanguage].hubs.map((item) => {
      const card = createCard('a', 'card hub-card');
      card.append(
        createTextElement('h3', item.title),
        createTextElement('p', item.body),
        createTextElement('span', translations[currentLanguage].cardOpen, 'card-link')
      );
      setExternalLink(card, item.href);
      return card;
    })
  );
};

const renderMap = (target, items) => {
  if (!target) return;
  target.replaceChildren(
    ...items.map(([title, href, body]) => {
      const card = createCard('a', 'card map-card');
      card.append(
        createTextElement('h3', title),
        createTextElement('p', body),
        createTextElement('span', translations[currentLanguage].cardOpen, 'card-link')
      );
      setContentLink(card, href);
      return card;
    })
  );
};

const getFilteredRepos = () => {
  const query = repoSearch?.value.trim().toLowerCase() || '';
  if (!query) return repoState.repos;
  return repoState.repos.filter((repo) => {
    const haystack = [repo.name, repo.description, repo.language].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
};

const updateSyncOutput = () => {
  if (!syncOutput) return;
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  syncOutput.textContent = lastSync ? `${translations[currentLanguage].lastSync} ${formatDateTime(lastSync)}` : '';
};

const updateGithubStatus = (visibleRepos) => {
  if (!githubStatus) return;

  const sourceMessage =
    repoState.source === 'live'
      ? translations[currentLanguage].cacheStatusLive
      : repoState.source === 'cache'
        ? translations[currentLanguage].cacheStatusCached
        : translations[currentLanguage].cacheStatusFallback;

  const statusCount = getRepositoryStatusCount({
    searchQuery: repoSearch?.value || '',
    visibleCount: visibleRepos.length,
    totalCount: repoState.repos.length
  });
  const countLabel = statusCount.searchActive ? translations[currentLanguage].filteredCount : translations[currentLanguage].liveCount;
  const countValue = statusCount.count;
  const countMessage = visibleRepos.length || !statusCount.searchActive
    ? `${countLabel} ${countValue}.`
    : translations[currentLanguage].cacheStatusEmpty;

  githubStatus.textContent = `${sourceMessage} ${countMessage} ${translations[currentLanguage].privateNote}`;
};

const renderRepos = () => {
  if (!repoGrid) return;
  const repos = getFilteredRepos();

  if (!repos.length) {
    const emptyCard = createCard('article', 'card repo-card repo-empty');
    emptyCard.append(createTextElement('h3', translations[currentLanguage].cacheStatusEmpty));
    repoGrid.replaceChildren(emptyCard);
    updateGithubStatus(repos);
    renderHeroStats();
    return;
  }

  repoGrid.replaceChildren(
    ...repos.map((repo) => {
      const card = createCard('article', 'card repo-card');
      const head = createCard('div', 'repo-card-head');
      head.append(
        createTextElement('h3', repo.name),
        createTextElement('span', repo.language || '—', 'repo-language')
      );

      const description = createTextElement('p', repo.description || '—');
      const meta = createCard('dl', 'repo-meta');
      [
        [translations[currentLanguage].cardUpdated, formatDateTime(repo.updated_at)],
        [translations[currentLanguage].cardIssues, String(repo.open_issues_count ?? 0)],
        [translations[currentLanguage].cardStars, String(repo.stargazers_count ?? 0)]
      ].forEach(([label, value]) => {
        const wrap = document.createElement('div');
        wrap.append(createTextElement('dt', label), createTextElement('dd', value));
        meta.append(wrap);
      });

      const link = createTextElement('a', translations[currentLanguage].cardOpen, 'card-link');
      setExternalLink(link, repo.html_url);

      card.append(head, description, meta, link);
      return card;
    })
  );

  updateGithubStatus(repos);
  renderHeroStats();
};

const refreshLiveContent = async ({ force = false } = {}) => {
  if (shouldReuseRefresh({ force, inFlight: Boolean(liveRefreshInFlight), mode: liveRefreshMode })) {
    return liveRefreshInFlight;
  }

  liveRefreshMode = force ? 'force' : 'default';
  liveRefreshInFlight = Promise.all([
    fetchContentSpotlights({ force }),
    fetchGitHubRepos({ force })
  ]).finally(() => {
    liveRefreshInFlight = null;
    liveRefreshMode = 'idle';
  });

  return liveRefreshInFlight;
};

const applyTranslations = () => {
  document.documentElement.lang = currentLanguage;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = translations[currentLanguage][key];
    if (value) el.textContent = value;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = translations[currentLanguage][key];
    if (value) el.setAttribute('placeholder', value);
  });

  const languageLabels = {
    en: translations[currentLanguage].langEn,
    nl: translations[currentLanguage].langNl,
    eo: translations[currentLanguage].langEo
  };

  languageButtons.forEach((btn) => {
    const selected = btn.dataset.lang === currentLanguage;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    btn.setAttribute('aria-label', languageLabels[btn.dataset.lang] || btn.dataset.lang);
  });
};

const rerenderAll = () => {
  applyTranslations();
  renderHeroStats();
  renderOverview();
  renderSpotlights();
  renderHubs();
  renderMap(canonGrid, content[currentLanguage].canon);
  renderMap(emeraldGrid, content[currentLanguage].emerald);
  renderRepos();
  updateSyncOutput();
};

const loadCachedRepos = () => {
  try {
    const raw = localStorage.getItem(REPO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.source !== 'live') return null;
    return Array.isArray(parsed.repos) ? parsed.repos : null;
  } catch {
    return null;
  }
};

const saveCachedRepos = (repos) => {
  localStorage.setItem(REPO_CACHE_KEY, JSON.stringify({ source: 'live', repos }));
};

const extractContentSnippet = (text, source) => {
  const lines = text.split('\n').map((line) => line.trim());
  const titleLine = lines.find((line) => line.startsWith('#')) || source.fallbackTitle;

  const snippetLines = [];
  for (const line of lines) {
    if (!line || line.startsWith('## ')) {
      if (snippetLines.length) break;
      continue;
    }
    if (line.startsWith('# ')) continue;
    const cleaned = cleanMarkdownLine(line);
    if (!cleaned) continue;
    snippetLines.push(cleaned);
    if (snippetLines.join(' ').length >= 220 || snippetLines.length >= 3) break;
  }

  return {
    ...source,
    title: cleanMarkdownLine(titleLine) || source.fallbackTitle,
    body: snippetLines.join(' ').slice(0, 260) || source.fallbackBody
  };
};

const fetchContentSpotlights = async ({ force = false } = {}) => {
  if (spotlightGrid) {
    const loadingCard = createCard('article', 'card spotlight-card');
    loadingCard.append(createTextElement('p', translations[currentLanguage].contentLoading, 'spotlight-body'));
    spotlightGrid.replaceChildren(loadingCard);
  }

  try {
    const responses = await Promise.all(
      contentSources.map(async (source) => {
        const response = await fetch(source.path, { cache: force ? 'no-store' : 'default' });
        if (!response.ok) throw new Error(`Failed to load ${source.path}`);
        const text = await response.text();
        return extractContentSnippet(text, source);
      })
    );

    contentState = {
      items: responses,
      source: 'live'
    };
  } catch {
    contentState = {
      items: contentSources.map((source) => ({
        ...source,
        title: source.fallbackTitle,
        body: source.fallbackBody
      })),
      source: 'fallback'
    };
  }

  renderSpotlights();
};

const fetchGitHubRepos = async ({ force = false } = {}) => {
  if (githubStatus) githubStatus.textContent = translations[currentLanguage].syncing;

  try {
    const response = await fetch(`https://api.github.com/users/${ACCOUNT_NAME}/repos?per_page=100&sort=updated`, {
      headers: {
        Accept: 'application/vnd.github+json'
      },
      cache: force ? 'no-store' : 'default'
    });

    if (!response.ok) {
      throw new Error(`GitHub request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const repos = normalizeRepositoryPayload(payload);
    if (!Array.isArray(payload)) {
      throw new Error('GitHub API returned a non-array response');
    }

    repoState = {
      repos: repos.length ? repos : fallbackRepos,
      source: repos.length ? 'live' : 'fallback'
    };

    if (repos.length) saveCachedRepos(repos);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  } catch {
    const cachedRepos = loadCachedRepos();
    repoState = cachedRepos?.length
      ? { repos: cachedRepos, source: 'cache' }
      : { repos: fallbackRepos, source: 'fallback' };
  }

  updateSyncOutput();
  renderRepos();
};

const setLanguage = (lang) => {
  if (!translations[lang]) return;
  currentLanguage = lang;
  localStorage.setItem('palaco-language', lang);
  rerenderAll();
};

languageButtons.forEach((button) => {
  button.addEventListener('click', () => setLanguage(button.dataset.lang));
});

repoSearch?.addEventListener('input', () => renderRepos());
syncBtn?.addEventListener('click', () => refreshLiveContent({ force: true }));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const registration = await navigator.serviceWorker.register('/sw.js');

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });

    registration.update();
    window.setInterval(() => {
      registration.update();
      refreshLiveContent({ force: true });
    }, AUTO_REFRESH_INTERVAL);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update();
        refreshLiveContent({ force: true });
      }
    });
  });
}

rerenderAll();
refreshLiveContent();
