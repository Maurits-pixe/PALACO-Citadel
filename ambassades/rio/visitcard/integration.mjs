const translations = {
  nl: {
    label: 'RIO · NOVA · JOUW EIGEN ID',
    title: 'Samen op één plek. Jij kiest de volgende stap.',
    policy: 'In het ontwerp geeft een bevestigd telefoonnummer óf bevestigd e-mailadres chattoelating, via P.P. gekoppeld aan je eigen persoons-ID. Wifi, mobiel of een andere verbinding verandert je ID niet.',
    reception: 'NOVA uitgelegd · receptie in het Nederlands',
    offline: 'Open de offline RIO-app',
    boundary: 'Je tijdelijke chat en Engine-oefening blijven afzonderlijk op deze pagina en gaan niet mee naar de andere routes. Deze uitleg registreert of bevestigt niets. Echte chat en accounts blijven gesloten.',
    mascotAlt: 'NOVA, de wegwijzer van deze proef',
  },
  en: {
    label: 'RIO · NOVA · YOUR OWN ID',
    title: 'Together in one place. You choose the next step.',
    policy: 'In the design, a confirmed phone number OR confirmed email address gives chat eligibility, linked through P.P. to your own person ID. Wi-Fi, mobile data or another connection does not change your ID.',
    reception: 'NOVA explained · reception in Dutch',
    offline: 'Open the offline RIO app',
    boundary: 'Your temporary chat and Engine exercise stay separate on this page and do not travel to the other routes. This explanation registers or confirms nothing. Real chat and accounts remain closed.',
    mascotAlt: 'NOVA, the guide for this trial',
  },
  de: {
    label: 'RIO · NOVA · DEINE EIGENE ID',
    title: 'Zusammen an einem Ort. Du wählst den nächsten Schritt.',
    policy: 'Im Entwurf berechtigt eine bestätigte Telefonnummer ODER eine bestätigte E-Mail-Adresse zum Chat, über P.P. mit deiner eigenen Personen-ID verknüpft. WLAN, mobile Daten oder eine andere Verbindung ändern deine ID nicht.',
    reception: 'NOVA erklärt · Empfang auf Niederländisch',
    offline: 'Die Offline-App von RIO öffnen',
    boundary: 'Dein vorübergehender Chat und die Engine-Übung bleiben getrennt auf dieser Seite und werden nicht zu den anderen Wegen übertragen. Diese Erklärung registriert oder bestätigt nichts. Echte Chats und Konten bleiben geschlossen.',
    mascotAlt: 'NOVA, die Wegweiserin für diesen Test',
  },
  fr: {
    label: 'RIO · NOVA · VOTRE PROPRE ID',
    title: 'Ensemble au même endroit. Vous choisissez la suite.',
    policy: 'Dans le modèle, un numéro de téléphone confirmé OU une adresse e-mail confirmée donne accès au chat en principe, via P.P. lié à votre identifiant personnel. Le Wi-Fi, les données mobiles ou une autre connexion ne changent pas votre identité.',
    reception: 'NOVA expliquée · accueil en néerlandais',
    offline: 'Ouvrir l’application RIO hors ligne',
    boundary: 'Votre chat temporaire et l’exercice Engine restent séparés sur cette page et ne sont pas transférés aux autres parcours. Cette explication ne procède à aucune inscription ni confirmation. Le chat réel et les comptes restent fermés.',
    mascotAlt: 'NOVA, le guide de cet essai',
  },
  es: {
    label: 'RIO · NOVA · TU PROPIO ID',
    title: 'Juntos en un mismo lugar. Tú eliges el siguiente paso.',
    policy: 'En el diseño, un teléfono confirmado O un correo electrónico confirmado permite acceder al chat, vinculado mediante P.P. a tu propio identificador personal. El wifi, los datos móviles u otra conexión no cambian tu ID.',
    reception: 'NOVA explicada · recepción en neerlandés',
    offline: 'Abrir la aplicación RIO sin conexión',
    boundary: 'Tu chat temporal y el ejercicio de Engine permanecen separados en esta página y no se transfieren a las otras rutas. Esta explicación no registra ni confirma nada. El chat real y las cuentas siguen cerrados.',
    mascotAlt: 'NOVA, la guía de esta prueba',
  },
  ar: {
    label: 'RIO · NOVA · هويتك الخاصة',
    title: 'معًا في مكان واحد. أنت تختار الخطوة التالية.',
    policy: 'في التصميم، يمنح رقم هاتف مؤكَّد أو عنوان بريد إلكتروني مؤكَّد أهلية الدردشة، مرتبطًا عبر P.P. بمعرّفك الشخصي الخاص. لا يغيّر اتصال Wi-Fi أو بيانات الهاتف أو أي اتصال آخر معرّفك.',
    reception: 'شرح NOVA · الاستقبال باللغة الهولندية',
    offline: 'افتح تطبيق RIO دون اتصال',
    boundary: 'تبقى الدردشة المؤقتة وتجربة Engine منفصلتين في هذه الصفحة ولا تنتقلان إلى المسارات الأخرى. لا يسجّل هذا الشرح أي بيانات ولا يؤكّد شيئًا. تظل الدردشة الحقيقية والحسابات مغلقة.',
    mascotAlt: 'NOVA، دليلك في هذه التجربة',
  },
  zh: {
    label: 'RIO · NOVA · 你自己的身份',
    title: '汇聚一处。由你选择下一步。',
    policy: '在设计中，已确认的电话号码或已确认的电子邮箱，任一项均可通过 P.P. 关联到你个人的身份标识，从而获得聊天资格。Wi-Fi、移动数据或其他网络连接不会改变你的身份标识。',
    reception: 'NOVA 说明 · 荷兰语接待页',
    offline: '打开离线 RIO 应用',
    boundary: '临时聊天和 Engine 练习分别保留在本页面，不会随导航转移到其他入口。本说明不会进行注册或确认。真实聊天和账户仍未开放。',
    mascotAlt: 'NOVA，本次试验的向导',
  },
};

function updateIntegration() {
  const language = Object.hasOwn(translations, document.documentElement.lang)
    ? document.documentElement.lang : 'nl';
  const copy = translations[language];
  document.querySelectorAll('[data-rio-integration]').forEach(element => {
    const text = copy[element.dataset.rioIntegration];
    if (typeof text === 'string') element.textContent = text;
  });
  document.querySelectorAll('[data-rio-integration-alt]').forEach(element => {
    const text = copy[element.dataset.rioIntegrationAlt];
    if (typeof text === 'string') element.alt = text;
  });
  const reception = document.getElementById('rio-unified-reception');
  if (reception && /^https?:$/.test(location.protocol)) {
    reception.setAttribute('href', '/rio/reception/#nova-explained:' + language);
  }
}

window.addEventListener('rio:languagechange', updateIntegration);
updateIntegration();
