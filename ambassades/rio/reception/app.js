'use strict';
(() => {
  const MAX_BYTES = 8192;
  const TIMEOUT_MS = 8000;
  const byId = id => document.getElementById(id);
  const novaCopyKeys = ['label', 'title', 'language', 'intro', 'doesTitle', 'does', 'choiceTitle', 'choice', 'boundaryTitle', 'boundary', 'scope'];
  const novaCopy = {
    nl: ['NOVA · jouw wegwijzer', 'Wie is NOVA?', 'Taal van deze uitleg',
      'NOVA helpt je beginnen bij PALACO RIO. De mascotte wijst je de weg.',
      'Dit doet NOVA', 'NOVA legt de routes uit. Je kunt naar de receptie kijken of een proef met een tweede apparaat openen.',
      'Jij kiest', 'Jij beslist of je verdergaat. Een pagina bekijken of een knop aanraken geeft geen toestemming voor contact.',
      'Dit blijft nog gesloten', 'Deze uitleg registreert je niet. Zij bevestigt geen telefoonnummer of e-mailadres en opent geen echte chat. BRI9ADE is hier een ontwerp; er worden geen negen controles uitgevoerd.',
      'Deze NOVA-uitleg is vertaald. De overige receptie blijft Nederlands. Je taalkeuze wordt hier niet opgeslagen.'],
    en: ['NOVA · your guide', 'Who is NOVA?', 'Language of this explanation',
      'NOVA helps you get started with PALACO RIO. The mascot shows you the way.',
      'What NOVA does', 'NOVA explains the routes. You can explore the reception or open a trial with a second device.',
      'You choose', 'You decide whether to continue. Viewing a page or touching a button does not give permission for contact.',
      'What remains closed', 'This explanation does not register you. It does not confirm a phone number or email address, or open a real chat. BRI9ADE is a design here; its nine checks are not performed.',
      'This NOVA explanation is translated. The rest of the reception remains in Dutch. Your language choice is not saved here.'],
    de: ['NOVA · dein Wegweiser', 'Wer ist NOVA?', 'Sprache dieser Erklärung',
      'NOVA hilft dir beim Einstieg in PALACO RIO. Das Maskottchen zeigt dir den Weg.',
      'Das macht NOVA', 'NOVA erklärt die Wege. Du kannst dir den Empfang ansehen oder einen Test mit einem zweiten Gerät öffnen.',
      'Du entscheidest', 'Du entscheidest, ob du weitergehst. Eine Seite anzusehen oder eine Schaltfläche zu berühren erteilt keine Erlaubnis zum Kontakt.',
      'Das bleibt noch geschlossen', 'Diese Erklärung registriert dich nicht. Sie bestätigt weder eine Telefonnummer noch eine E-Mail-Adresse und öffnet keinen echten Chat. BRI9ADE ist hier ein Entwurf; die neun Prüfungen werden nicht durchgeführt.',
      'Diese NOVA-Erklärung ist übersetzt. Der übrige Empfang bleibt auf Niederländisch. Deine Sprachwahl wird hier nicht gespeichert.'],
    fr: ['NOVA · votre guide', 'Qui est NOVA ?', 'Langue de cette explication',
      'NOVA vous aide à découvrir PALACO RIO. La mascotte vous montre le chemin.',
      'Ce que fait NOVA', 'NOVA explique les parcours. Vous pouvez découvrir l’accueil ou ouvrir un essai avec un deuxième appareil.',
      'Vous choisissez', 'Vous décidez de continuer ou non. Consulter une page ou toucher un bouton ne donne pas la permission de prendre contact.',
      'Ce qui reste fermé', 'Cette explication ne vous inscrit pas. Elle ne confirme ni numéro de téléphone ni adresse e-mail et n’ouvre pas de véritable chat. BRI9ADE est ici un projet ; les neuf contrôles ne sont pas effectués.',
      'Cette explication de NOVA est traduite. Le reste de l’accueil demeure en néerlandais. Votre choix de langue n’est pas enregistré ici.'],
    es: ['NOVA · tu guía', '¿Quién es NOVA?', 'Idioma de esta explicación',
      'NOVA te ayuda a empezar en PALACO RIO. La mascota te muestra el camino.',
      'Qué hace NOVA', 'NOVA explica las rutas. Puedes explorar la recepción o abrir una prueba con un segundo dispositivo.',
      'Tú eliges', 'Tú decides si continúas. Ver una página o tocar un botón no da permiso para establecer contacto.',
      'Qué sigue cerrado', 'Esta explicación no te registra. No confirma un número de teléfono ni una dirección de correo, ni abre un chat real. BRI9ADE es aquí un diseño; no se realizan los nueve controles.',
      'Esta explicación de NOVA está traducida. El resto de la recepción sigue en neerlandés. Tu elección de idioma no se guarda aquí.'],
    it: ['NOVA · la tua guida', 'Chi è NOVA?', 'Lingua di questa spiegazione',
      'NOVA ti aiuta a iniziare con PALACO RIO. La mascotte ti mostra la strada.',
      'Cosa fa NOVA', 'NOVA spiega i percorsi. Puoi esplorare l’accoglienza o aprire una prova con un secondo dispositivo.',
      'Scegli tu', 'Decidi tu se continuare. Guardare una pagina o toccare un pulsante non dà il permesso di avviare un contatto.',
      'Cosa resta chiuso', 'Questa spiegazione non ti registra. Non conferma un numero di telefono o un indirizzo e-mail e non apre una vera chat. BRI9ADE è qui un progetto; i nove controlli non vengono eseguiti.',
      'Questa spiegazione di NOVA è tradotta. Il resto dell’accoglienza rimane in olandese. La tua scelta della lingua non viene salvata qui.'],
    pt: ['NOVA · a tua guia', 'Quem é a NOVA?', 'Idioma desta explicação',
      'A NOVA ajuda-te a começar no PALACO RIO. A mascote mostra-te o caminho.',
      'O que faz a NOVA', 'A NOVA explica os percursos. Podes explorar a receção ou abrir um teste com um segundo dispositivo.',
      'Tu escolhes', 'Tu decides se queres continuar. Ver uma página ou tocar num botão não dá autorização para estabelecer contacto.',
      'O que continua fechado', 'Esta explicação não te regista. Não confirma um número de telefone ou endereço de e-mail, nem abre uma conversa real. A BRI9ADE é aqui um projeto; os nove controlos não são realizados.',
      'Esta explicação da NOVA está traduzida. O resto da receção continua em neerlandês. A tua escolha de idioma não é guardada aqui.'],
    ru: ['NOVA · твой проводник', 'Кто такая NOVA?', 'Язык этого объяснения',
      'NOVA помогает начать знакомство с PALACO RIO. Этот персонаж показывает путь.',
      'Что делает NOVA', 'NOVA объясняет маршруты. Можно посмотреть приёмную или открыть пробу со вторым устройством.',
      'Выбираешь ты', 'Ты решаешь, продолжать ли дальше. Просмотр страницы или нажатие кнопки не даёт разрешения на контакт.',
      'Что пока закрыто', 'Это объяснение не регистрирует тебя. Оно не подтверждает номер телефона или адрес электронной почты и не открывает настоящий чат. BRI9ADE здесь — проект; девять проверок не выполняются.',
      'Это объяснение NOVA переведено. Остальная приёмная остаётся на нидерландском языке. Твой выбор языка здесь не сохраняется.'],
    zh: ['NOVA · 你的向导', 'NOVA 是谁？', '本说明的语言',
      'NOVA 帮助你开始了解 PALACO RIO。这位吉祥物会为你指路。',
      'NOVA 做什么', 'NOVA 介绍各条路径。你可以了解接待页，或打开使用第二台设备的试验。',
      '由你选择', '是否继续由你决定。查看页面或点击按钮，并不代表获得联系许可。',
      '哪些功能仍未开放', '本说明不会为你注册，不会确认电话号码或电子邮箱，也不会开启真正的聊天。BRI9ADE 在这里仍是设计，不会执行九项检查。',
      '这部分 NOVA 说明已翻译。接待页的其他内容仍为荷兰语。这里不会保存你的语言选择。'],
    ar: ['NOVA · دليلك', 'من هي NOVA؟', 'لغة هذا الشرح',
      'تساعدك NOVA على البدء مع PALACO RIO. هذه الشخصية ترشدك إلى الطريق.',
      'ماذا تفعل NOVA؟', 'تشرح NOVA المسارات. يمكنك استكشاف صفحة الاستقبال أو فتح تجربة باستخدام جهاز ثانٍ.',
      'أنت تختار', 'أنت تقرر إن كنت تريد المتابعة. مشاهدة صفحة أو لمس زر لا يمنح إذنًا بالتواصل.',
      'ما الذي لم يُفتح بعد؟', 'هذا الشرح لا يسجّلك. لا يؤكّد رقم هاتف أو عنوان بريد إلكتروني ولا يفتح دردشة حقيقية. تظل BRI9ADE هنا تصميمًا؛ ولا تُجرى الفحوص التسعة.',
      'تُرجم هذا الشرح الخاص بـ NOVA. تبقى بقية صفحة الاستقبال باللغة الهولندية. لا يُحفظ اختيارك للغة هنا.'],
    eo: ['NOVA · via gvidanto', 'Kiu estas NOVA?', 'Lingvo de ĉi tiu klarigo',
      'NOVA helpas vin ekkoni PALACO RIO. La maskoto montras al vi la vojon.',
      'Kion faras NOVA?', 'NOVA klarigas la vojojn. Vi povas esplori la akceptejon aŭ malfermi provon per dua aparato.',
      'Vi elektas', 'Vi decidas, ĉu daŭrigi. Rigardi paĝon aŭ tuŝi butonon ne donas permeson por kontakto.',
      'Kio restas fermita?', 'Ĉi tiu klarigo ne registras vin. Ĝi ne konfirmas telefonnumeron aŭ retpoŝtadreson kaj ne malfermas veran babilejon. BRI9ADE estas ĉi tie projekto; la naŭ kontroloj ne estas farataj.',
      'Ĉi tiu klarigo pri NOVA estas tradukita. La cetera akceptejo restas en la nederlanda. Via lingvoelekto ne estas konservata ĉi tie.'],
  };
  const novaRouteKeys = ['title', 'note', 'destination', 'deviceTitle', 'deviceCopy', 'deviceAction', 'receptionTitle', 'receptionCopy', 'receptionAction'];
  const novaRoutes = {
    nl: ['Kies een proef', 'De proeven zijn Nederlands en openen in een nieuw tabblad. Deze uitleg blijft hier open.', 'Andere proefsite:',
      'Met twee apparaten', 'Stuur samen gemaakte testcodes heen en terug. De testserver kan de codes lezen. Gebruik geen persoonlijke berichten.', 'Open de telefoonproef',
      'Bekijk de ontvangst', 'Probeer een verzonnen verzoek bij NOVA. Een ontvangstkeuze opent geen contact met een andere persoon.', 'Open de NOVA-proef'],
    en: ['Choose a trial', 'The trials are in Dutch and open in a new tab. This explanation stays open here.', 'Other trial site:',
      'With two devices', 'Send made-up test codes back and forth together. The test server can read the codes. Do not use personal messages.', 'Open the phone trial',
      'Explore the reception', 'Try a made-up request with NOVA. A reception choice does not open contact with another person.', 'Open the NOVA trial'],
    de: ['Wähle einen Test', 'Die Tests sind auf Niederländisch und öffnen sich in einem neuen Tab. Diese Erklärung bleibt hier geöffnet.', 'Andere Testseite:',
      'Mit zwei Geräten', 'Sendet gemeinsam erfundene Testcodes hin und her. Der Testserver kann die Codes lesen. Verwendet keine persönlichen Nachrichten.', 'Öffne den Telefontest',
      'Entdecke den Empfang', 'Probiere eine erfundene Anfrage bei NOVA aus. Eine Empfangsauswahl öffnet keinen Kontakt zu einer anderen Person.', 'Öffne den NOVA-Test'],
    fr: ['Choisissez un essai', 'Les essais sont en néerlandais et s’ouvrent dans un nouvel onglet. Cette explication reste ouverte ici.', 'Autre site d’essai :',
      'Avec deux appareils', 'Envoyez ensemble des codes de test inventés dans les deux sens. Le serveur de test peut les lire. N’utilisez pas de messages personnels.', 'Ouvrir l’essai sur téléphone',
      'Découvrez l’accueil', 'Essayez une demande inventée auprès de NOVA. Un choix à l’accueil n’ouvre pas de contact avec une autre personne.', 'Ouvrir l’essai NOVA'],
    es: ['Elige una prueba', 'Las pruebas están en neerlandés y se abren en una pestaña nueva. Esta explicación queda abierta aquí.', 'Otro sitio de pruebas:',
      'Con dos dispositivos', 'Enviad juntos códigos de prueba inventados en ambos sentidos. El servidor de prueba puede leerlos. No uséis mensajes personales.', 'Abrir la prueba de teléfono',
      'Explora la recepción', 'Prueba una solicitud inventada con NOVA. Elegir una opción en la recepción no abre contacto con otra persona.', 'Abrir la prueba de NOVA'],
    it: ['Scegli una prova', 'Le prove sono in olandese e si aprono in una nuova scheda. Questa spiegazione resta aperta qui.', 'Altro sito di prova:',
      'Con due dispositivi', 'Inviate insieme codici di prova inventati in entrambe le direzioni. Il server di prova può leggerli. Non usate messaggi personali.', 'Apri la prova sul telefono',
      'Scopri l’accoglienza', 'Prova una richiesta inventata con NOVA. Una scelta all’accoglienza non apre un contatto con un’altra persona.', 'Apri la prova NOVA'],
    pt: ['Escolhe um teste', 'Os testes estão em neerlandês e abrem num novo separador. Esta explicação fica aberta aqui.', 'Outro site de testes:',
      'Com dois dispositivos', 'Enviem juntos códigos de teste inventados nos dois sentidos. O servidor de teste pode ler os códigos. Não usem mensagens pessoais.', 'Abrir o teste no telefone',
      'Explora a receção', 'Experimenta um pedido inventado com a NOVA. Uma escolha na receção não abre contacto com outra pessoa.', 'Abrir o teste da NOVA'],
    ru: ['Выбери пробу', 'Пробы на нидерландском языке откроются в новой вкладке. Это объяснение останется открытым здесь.', 'Другой сайт для проб:',
      'С двумя устройствами', 'Отправляйте друг другу придуманные тестовые коды. Тестовый сервер может читать коды. Не используйте личные сообщения.', 'Открыть пробу с телефоном',
      'Посмотри приёмную', 'Попробуй вымышленный запрос к NOVA. Выбор в приёмной не открывает контакт с другим человеком.', 'Открыть пробу NOVA'],
    zh: ['选择一项试验', '试验页面为荷兰语，将在新标签页中打开。本说明会继续在这里保持打开。', '另一个试验网站：',
      '使用两台设备', '一起往返发送虚构的测试代码。测试服务器可以读取这些代码。请勿使用私人消息。', '打开手机试验',
      '了解接待过程', '向 NOVA 提交一个虚构的请求进行试验。在接待页做出选择不会开启与他人的联系。', '打开 NOVA 试验'],
    ar: ['اختر تجربة', 'صفحات التجارب باللغة الهولندية وتُفتح في علامة تبويب جديدة. يبقى هذا الشرح مفتوحًا هنا.', 'موقع آخر للتجربة:',
      'باستخدام جهازين', 'تبادلا رموز اختبار مختلقة ذهابًا وإيابًا. يستطيع خادم الاختبار قراءة الرموز. لا تستخدما رسائل شخصية.', 'افتح تجربة الهاتف',
      'استكشف الاستقبال', 'جرّب طلبًا مختلقًا لدى NOVA. الاختيار في صفحة الاستقبال لا يفتح تواصلًا مع شخص آخر.', 'افتح تجربة NOVA'],
    eo: ['Elektu provon', 'La provoj estas en la nederlanda kaj malfermiĝas en nova langeto. Ĉi tiu klarigo restas malfermita ĉi tie.', 'Alia prova retejo:',
      'Per du aparatoj', 'Sendu kune elpensitajn testkodojn tien kaj reen. La testservilo povas legi la kodojn. Ne uzu personajn mesaĝojn.', 'Malfermu la telefonan provon',
      'Esploru la akceptejon', 'Provu elpensitan peton ĉe NOVA. Elekto ĉe la akceptejo ne malfermas kontakton kun alia persono.', 'Malfermu la NOVA-provon'],
  };
  const novaLanguage = byId('nova-language');
  function explainNova(language) {
    const selected = Object.hasOwn(novaCopy, language) ? language : 'nl';
    const section = byId('nova-explained');
    section.lang = selected === 'zh' ? 'zh-Hans' : selected;
    section.dir = selected === 'ar' ? 'rtl' : 'ltr';
    section.querySelectorAll('[data-nova-copy]').forEach(element => {
      element.textContent = novaCopy[selected][novaCopyKeys.indexOf(element.dataset.novaCopy)];
    });
    section.querySelectorAll('[data-nova-route-copy]').forEach(element => {
      element.textContent = novaRoutes[selected][novaRouteKeys.indexOf(element.dataset.novaRouteCopy)];
    });
    novaLanguage.value = selected;
  }
  if (novaLanguage) {
    explainNova(navigator.language?.toLowerCase().split('-')[0]);
    novaLanguage.disabled = false;
    const fallbackHint = byId('nova-no-script');
    if (fallbackHint) fallbackHint.hidden = true;
    novaLanguage.addEventListener('change', () => explainNova(novaLanguage.value));
  }
  const nova = byId('runtime-nova');
  const device = byId('runtime-device');
  const feedback = byId('availability-feedback');
  const refresh = byId('refresh-availability');
  const version = byId('build-version');
  const exampleContact = byId('pp-example-contact');
  const exampleTransport = byId('pp-example-transport');
  const exampleShow = byId('pp-example-show');
  const exampleResult = byId('pp-example-result');
  const pending = new Set();
  const staticPreview = document.documentElement.dataset.runtimeMode === 'static-preview';
  const previewCopy = 'Deze preview meet de bereikbaarheid niet. Open een proef op de beveiligde proefserver om zelf verder te gaan.';
  let checking = false;
  let generation = 0;
  let pageActive = true;
  const unconfirmedCopy = 'De bereikbaarheid is niet bevestigd. Kies Opnieuw controleren om opnieuw te kijken.';
  const offlineCopy = 'Je bent offline. Maak verbinding en kies daarna Opnieuw controleren.';

  const exampleCopy = {
    UNCONFIRMED: 'Voorbeeld: er is nog geen telefoonnummer of e-mailadres bevestigd. Daarmee is er nog geen chattoelating in het ontwerp.',
    PHONE: 'Voorbeeld: een bevestigd telefoonnummer is via je P.P. gekoppeld aan je eigen persoons-ID. Daarmee krijg je chattoelating in het ontwerp. Wifi, mobiele data of een andere verbinding verandert dit niet.',
    EMAIL: 'Voorbeeld: een bevestigd e-mailadres is via je P.P. gekoppeld aan je eigen persoons-ID. Daarmee krijg je chattoelating in het ontwerp. Wifi, mobiele data of een andere verbinding verandert dit niet.',
  };

  function resetExample() {
    exampleResult.dataset.state = 'not-confirmed';
    exampleResult.textContent = 'De voorbeeldkeuze is gewijzigd. Kies Toon voorbeeld om de uitleg te bekijken.';
  }

  function showExample() {
    const confirmed = exampleContact.value === 'PHONE' || exampleContact.value === 'EMAIL';
    const knownTransport = ['WIFI', 'MOBILE', 'OTHER'].includes(exampleTransport.value);
    exampleResult.dataset.state = confirmed && knownTransport ? 'eligible' : 'not-confirmed';
    exampleResult.textContent = confirmed && knownTransport ? exampleCopy[exampleContact.value] : exampleCopy.UNCONFIRMED;
    exampleResult.focus();
  }

  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validNova = value => object(value)
    && value.component === 'NOVA_RECEPTION' && value.version === '0.3' && value.running === true
    && value.receptionEnabled === true && value.firstAcceptanceEnabled === true && value.checkGateEnabled === true
    && value.guardianRuntimeConnected === false && value.stewardRuntimeConnected === false
    && value.finalConsentEnabled === false && value.chatEnabled === false;
  const validDevice = value => object(value)
    && value.component === 'RIO_DEVICE_TEST' && value.version === '0.1' && value.mode === 'TEST_ONLY'
    && value.running === true && value.accountAccess === 'CLOSED' && value.auth === 'HOLD'
    && value.serverReadable === true && value.generatedCodesOnly === true && value.authenticatedIdentity === false
    && value.accountActive === false && value.account1 === 'HOLD' && value.canOpenContact === false
    && value.operativeAuthority === 'NONE' && value.endToEndEncrypted === false;

  async function runtime(path, valid) {
    const controller = new AbortController();
    pending.add(controller);
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let reader;
    try {
      const response = await fetch(path, {
        method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (response.status !== 200 || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
          || !response.body) throw new Error('Unavailable');
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let size = 0;
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('Unavailable');
        content += decoder.decode(value, { stream: true });
      }
      content += decoder.decode();
      const result = JSON.parse(content);
      if (!valid(result)) throw new Error('Unavailable');
      return result;
    } finally {
      clearTimeout(timer);
      pending.delete(controller);
      controller.abort();
      if (reader) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }

  function state(element, available) {
    element.textContent = available ? 'Bereikbaar' : 'Niet bevestigd';
    element.dataset.state = available ? 'available' : 'unconfirmed';
  }

  function invalidateAvailability() {
    generation++;
    for (const controller of pending) controller.abort();
    state(nova, false);
    state(device, false);
    version.textContent = 'Onbekend';
    feedback.textContent = staticPreview ? previewCopy : navigator.onLine === false ? offlineCopy : unconfirmedCopy;
    checking = false;
    refresh.disabled = staticPreview;
  }

  async function checkAvailability() {
    if (staticPreview) {
      invalidateAvailability();
      return;
    }
    if (checking) return;
    if (!pageActive || navigator.onLine === false) {
      invalidateAvailability();
      return;
    }
    const run = ++generation;
    checking = true;
    refresh.disabled = true;
    for (const element of [nova, device]) {
      element.textContent = 'Wordt gecontroleerd';
      element.dataset.state = 'checking';
    }
    version.textContent = 'Onbekend';
    feedback.textContent = 'NOVA kijkt of de twee proefroutes bereikbaar zijn.';
    const results = await Promise.allSettled([
      runtime('/api/rio/nova/runtime', validNova),
      runtime('/api/rio/device-test/runtime', validDevice),
    ]);
    // A departed/offline page invalidates the whole pair, including already fulfilled reads.
    // An older round must also leave a newer round's busy/button state untouched.
    if (run !== generation) return;
    if (!pageActive || navigator.onLine === false) {
      invalidateAvailability();
      return;
    }
    const novaAvailable = results[0].status === 'fulfilled';
    const deviceAvailable = results[1].status === 'fulfilled';
    state(nova, novaAvailable);
    state(device, deviceAvailable);
    if (deviceAvailable) {
      const build = results[1].value.buildCommit;
      if (typeof build === 'string' && /^[a-f0-9]{40}$/.test(build)) version.textContent = build.slice(0, 12);
    }
    feedback.textContent = novaAvailable && deviceAvailable
      ? 'Beide proefroutes zijn bereikbaar. Je kunt zelf een volgende stap kiezen.'
      : novaAvailable || deviceAvailable
        ? 'Eén proefroute is bereikbaar. De andere is niet bevestigd. Je kunt de bereikbaarheid opnieuw controleren.'
        : 'De bereikbaarheid is niet bevestigd. Je kunt de controle zelf opnieuw starten.';
    checking = false;
    refresh.disabled = false;
  }

  refresh.addEventListener('click', () => { void checkAvailability(); });
  exampleContact.addEventListener('change', resetExample);
  exampleTransport.addEventListener('change', resetExample);
  exampleShow.addEventListener('click', showExample);
  window.addEventListener('offline', invalidateAvailability);
  window.addEventListener('online', () => {
    if (!checking) invalidateAvailability();
  });
  window.addEventListener('pagehide', () => {
    pageActive = false;
    invalidateAvailability();
  });
  window.addEventListener('pageshow', event => {
    const restored = !pageActive || event.persisted;
    pageActive = true;
    if (restored) invalidateAvailability();
  });
  void checkAvailability();
})();
