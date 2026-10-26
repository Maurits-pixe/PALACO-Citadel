const copy = {
  en: {
    title: 'Aegis · Monitoring simulation', back: '← Citadel home', language: 'Language',
    eyebrow: 'CITADEL SYSTEMS · VISUAL CONCEPT', noticeTitle: 'SIMULATION ONLY · NO LIVE MONITORING',
    noticeBody: 'All map points, threat values, system metrics, and alerts are generated in this browser. Aegis does not connect to a network, inspect traffic, detect threats, or block activity. Do not use this display for security decisions.',
    workspaceLabel: 'DEMO ENVIRONMENT', overviewTitle: 'Signal overview', simulatedFeed: 'SYNTHETIC FEED',
    mapEyebrow: 'ILLUSTRATIVE · NOT GEOGRAPHIC', mapTitle: 'Traffic visualization',
    mapCaption: 'SYNTHETIC SIGNALS · POSITIONS ARE DECORATIVE', signalPoint: 'Synthetic signal', watchPoint: 'Simulated watch event',
    threatEyebrow: 'RANDOMIZED DEMO VALUE', threatTitle: 'Threat meter', threatLow: 'LOW · SIMULATED',
    threatElevated: 'ELEVATED · SIMULATED', threatHigh: 'HIGH · SIMULATED',
    threatNote: 'This changing value is random demo output, not an assessment of actual risk.',
    healthEyebrow: 'GENERATED LOCALLY · NO DEVICE TELEMETRY', healthTitle: 'System health',
    cpuLabel: 'CPU LOAD', memoryLabel: 'MEMORY LOAD', networkLabel: 'NETWORK LOAD',
    cpuChart: 'Synthetic CPU history', memoryChart: 'Synthetic memory history', networkChart: 'Synthetic network history',
    healthNote: 'Values and charts are generated for this demo; they do not describe this device or a real system.',
    alertsEyebrow: 'FICTIONAL EVENTS · NO BLOCKING OCCURS', alertsTitle: 'Demo alert feed',
    alertsNote: 'These entries are synthetic examples, not observed or blocked attacks.',
    alertStatus: 'SIMULATED · NOT BLOCKED', alertEmpty: 'No synthetic demo events.',
    eventScan: 'Synthetic pattern match', eventBurst: 'Illustrative traffic spike', eventPolicy: 'Demo rule notification',
    footer: 'Aegis is a visual simulation. No live traffic, threat detection, system telemetry, network connection, or defensive action is implemented.'
  },
  nl: {
    title: 'Aegis · Monitoring-simulatie', back: '← Citadel-startpagina', language: 'Taal',
    eyebrow: 'CITADEL-SYSTEMEN · VISUEEL CONCEPT', noticeTitle: 'ALLEEN SIMULATIE · GEEN LIVE MONITORING',
    noticeBody: 'Alle kaartpunten, dreigingswaarden, systeemmetingen en meldingen worden in deze browser gegenereerd. Aegis maakt geen netwerkverbinding, inspecteert geen verkeer, detecteert geen dreigingen en blokkeert niets. Gebruik dit scherm niet voor beveiligingsbeslissingen.',
    workspaceLabel: 'DEMO-OMGEVING', overviewTitle: 'Signaaloverzicht', simulatedFeed: 'SYNTHETISCHE FEED',
    mapEyebrow: 'ILLUSTRATIEF · NIET GEOGRAFISCH', mapTitle: 'Verkeersvisualisatie',
    mapCaption: 'SYNTHETISCHE SIGNALEN · POSITIES ZIJN DECORATIEF', signalPoint: 'Synthetisch signaal', watchPoint: 'Gesimuleerde observatie',
    threatEyebrow: 'GERANDOMISEERDE DEMOWAARDE', threatTitle: 'Dreigingsmeter', threatLow: 'LAAG · GESIMULEERD',
    threatElevated: 'VERHOOGD · GESIMULEERD', threatHigh: 'HOOG · GESIMULEERD',
    threatNote: 'Deze veranderende waarde is willekeurige demo-uitvoer en geen echte risico-inschatting.',
    healthEyebrow: 'LOKAAL GEGENEREERD · GEEN APPARAATTELEMETRIE', healthTitle: 'Systeemstatus',
    cpuLabel: 'CPU-BELASTING', memoryLabel: 'GEHEUGENBELASTING', networkLabel: 'NETWERKBELASTING',
    cpuChart: 'Synthetische CPU-geschiedenis', memoryChart: 'Synthetische geheugengeschiedenis', networkChart: 'Synthetische netwerkgeschiedenis',
    healthNote: 'Waarden en grafieken zijn voor deze demo gegenereerd; ze beschrijven dit apparaat of een echt systeem niet.',
    alertsEyebrow: 'FICTIEVE GEBEURTENISSEN · ER WORDT NIETS GEBLOKKEERD', alertsTitle: 'Demo-meldingen',
    alertsNote: 'Dit zijn synthetische voorbeelden, geen waargenomen of geblokkeerde aanvallen.',
    alertStatus: 'GESIMULEERD · NIET GEBLOKKEERD', alertEmpty: 'Geen synthetische demo-gebeurtenissen.',
    eventScan: 'Synthetische patroonmatch', eventBurst: 'Illustratieve verkeerspiek', eventPolicy: 'Demo-regelmelding',
    footer: 'Aegis is een visuele simulatie. Live verkeer, dreigingsdetectie, systeemtelemetrie, netwerkverbinding en verdedigingsacties zijn niet geïmplementeerd.'
  },
  eo: {
    title: 'Aegis · Monitora simulilo', back: '← Citadel-hejmpaĝo', language: 'Lingvo',
    eyebrow: 'CITADEL-SISTEMOJ · VIDA KONCEPTO', noticeTitle: 'NUR SIMULADO · NENIU REALTEMPA MONITORADO',
    noticeBody: 'Ĉiuj mapaj punktoj, minacaj valoroj, sistemaj mezuroj kaj atentigoj estas generataj en ĉi tiu retumilo. Aegis ne konektiĝas al reto, ne inspektas trafikon, ne detektas minacojn kaj nenion blokas. Ne uzu ĉi tiun ekranon por sekurecaj decidoj.',
    workspaceLabel: 'DEMA MEDIO', overviewTitle: 'Signala superrigardo', simulatedFeed: 'SINTETIKA FLUO',
    mapEyebrow: 'ILUSTRA · NE GEOGRAFIA', mapTitle: 'Trafika bildigo',
    mapCaption: 'SINTETIKAJ SIGNALOJ · POZICIOJ ESTAS ORNAMaj'.toUpperCase(), signalPoint: 'Sinteza signalo', watchPoint: 'Simulita observa evento',
    threatEyebrow: 'HAZARDA DEMOVALORO', threatTitle: 'Minaca mezurilo', threatLow: 'MALALTA · SIMULITA',
    threatElevated: 'PLI ALTA · SIMULITA', threatHigh: 'ALTA · SIMULITA',
    threatNote: 'Ĉi tiu ŝanĝiĝanta valoro estas hazarda demo-eligo, ne takso de reala risko.',
    healthEyebrow: 'LOKE GENERATA · NENIU APARATA TELEMETRIO', healthTitle: 'Sistema stato',
    cpuLabel: 'CPU-ŜARĜO', memoryLabel: 'MEMORA ŜARĜO', networkLabel: 'RETA ŜARĜO',
    cpuChart: 'Sinteza CPU-historio', memoryChart: 'Sinteza memora historio', networkChart: 'Sinteza reta historio',
    healthNote: 'Valoroj kaj diagramoj estas generataj por ĉi tiu demo; ili ne priskribas ĉi tiun aparaton aŭ realan sistemon.',
    alertsEyebrow: 'FIKCIAJ EVENTOJ · NENIO ESTAS BLOKATA', alertsTitle: 'Demo-atentigoj',
    alertsNote: 'Ĉi tiuj estas sintezaj ekzemploj, ne observitaj aŭ blokitaj atakoj.',
    alertStatus: 'SIMULITA · NE BLOKITA', alertEmpty: 'Neniuj sintezaj demo-eventoj.',
    eventScan: 'Sinteza ŝablona kongruo', eventBurst: 'Ilustra trafika pliiĝo', eventPolicy: 'Demo-regula sciigo',
    footer: 'Aegis estas vida simulado. Neniu realtempa trafiko, minacdetekto, sistema telemetrio, reta konekto aŭ defenda ago estas efektivigita.'
  }
};

const metrics = {
  cpu: { value: 32, history: [24, 35, 29, 41, 33, 38, 30, 36, 32, 44, 28, 32] },
  memory: { value: 54, history: [49, 52, 51, 55, 53, 57, 50, 56, 54, 58, 52, 54] },
  network: { value: 41, history: [29, 36, 33, 45, 37, 42, 39, 48, 36, 44, 38, 41] }
};
const events = ['eventScan', 'eventBurst', 'eventPolicy'];
const initialEvents = [
  { key: 'eventScan', source: 'SIM-EDGE-04', seconds: 8 },
  { key: 'eventBurst', source: 'DEMO-NODE-12', seconds: 23 },
  { key: 'eventPolicy', source: 'SIM-CORE-02', seconds: 46 }
];
const alertList = document.querySelector('#alert-list');
const mapPoints = document.querySelector('#map-points');
const languageSelect = document.querySelector('#language-select');
let language = 'en';
let tickCount = 0;
let threat = 18;

function t(key) {
  return copy[language][key] || copy.en[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = language;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = t(element.dataset.i18n);
  });
  for (const name of Object.keys(metrics)) {
    document.querySelector(`#${name}-chart`).setAttribute('aria-label', t(`${name}Chart`));
  }
  renderThreat();
  renderAlerts();
}

function renderThreat() {
  const fill = document.querySelector('#threat-fill');
  const meter = document.querySelector('#threat-meter');
  const value = document.querySelector('#threat-value');
  const status = document.querySelector('#threat-status');
  const color = threat < 30 ? 'var(--green)' : threat < 70 ? 'var(--amber)' : 'var(--red)';
  const label = threat < 30 ? 'threatLow' : threat < 70 ? 'threatElevated' : 'threatHigh';
  fill.style.width = `${threat}%`;
  fill.style.backgroundColor = color;
  value.textContent = String(threat);
  value.style.color = color;
  meter.setAttribute('aria-valuenow', String(threat));
  status.textContent = t(label);
  status.style.color = color;
}

function renderMetric(name) {
  const metric = metrics[name];
  document.querySelector(`#${name}-value`).textContent = `${metric.value}%`;
  document.querySelector(`#${name}-bar`).style.width = `${metric.value}%`;
  const chart = document.querySelector(`#${name}-chart`);
  chart.replaceChildren(...metric.history.map(amount => {
    const bar = document.createElement('span');
    bar.className = 'chart-bar';
    bar.style.height = `${Math.max(8, amount)}%`;
    return bar;
  }));
}

function addMapPoint(watch = false) {
  const point = document.createElement('span');
  point.className = `map-point${watch ? ' watch' : ''}`;
  point.style.left = `${8 + Math.random() * 84}%`;
  point.style.top = `${12 + Math.random() * 72}%`;
  mapPoints.append(point);
  while (mapPoints.children.length > 12) mapPoints.firstElementChild.remove();
}

function renderAlerts() {
  alertList.replaceChildren(...initialEvents.slice(0, 8).map(event => {
    const item = document.createElement('li');
    item.className = 'alert-item';
    const title = document.createElement('span');
    title.className = 'alert-event';
    title.textContent = t(event.key);
    const time = document.createElement('time');
    time.className = 'alert-time';
    time.textContent = new Date(Date.now() - event.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const source = document.createElement('span');
    source.className = 'alert-source';
    source.textContent = event.source;
    const status = document.createElement('span');
    status.className = 'alert-status';
    status.textContent = t('alertStatus');
    item.append(title, time, source, status);
    return item;
  }));
  document.querySelector('#alert-count').textContent = `${String(initialEvents.length).padStart(2, '0')} ${language === 'en' ? 'EVENTS' : language === 'nl' ? 'EVENTEN' : 'EVENTOJ'}`;
  if (initialEvents.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = t('alertEmpty');
    alertList.append(empty);
  }
}

function updateSimulation() {
  tickCount += 1;
  metrics.cpu.value = 25 + (tickCount * 7) % 58;
  metrics.memory.value = 40 + (tickCount * 5) % 48;
  metrics.network.value = 20 + (tickCount * 11) % 72;
  for (const name of Object.keys(metrics)) {
    metrics[name].history.push(metrics[name].value);
    metrics[name].history.shift();
    renderMetric(name);
  }
  threat = Math.max(3, Math.min(92, 18 + Math.round(26 * Math.sin(tickCount / 3))));
  renderThreat();
  const watch = tickCount % 3 === 0;
  addMapPoint(watch);
  if (watch) {
    initialEvents.unshift({
      key: events[(tickCount / 3 - 1) % events.length],
      source: `DEMO-NODE-${String((tickCount * 7) % 90 + 10).padStart(2, '0')}`,
      seconds: 0
    });
    renderAlerts();
  }
}

languageSelect.addEventListener('change', () => {
  language = copy[languageSelect.value] ? languageSelect.value : 'en';
  try {
    localStorage.setItem('palaco-language', language);
  } catch {}
  applyLanguage();
});

try {
  const savedLanguage = localStorage.getItem('palaco-language');
  if (copy[savedLanguage]) {
    language = savedLanguage;
    languageSelect.value = language;
  }
} catch {}

for (const name of Object.keys(metrics)) renderMetric(name);
for (let index = 0; index < 8; index += 1) addMapPoint(index === 2 || index === 6);
applyLanguage();
setInterval(updateSimulation, 1500);
