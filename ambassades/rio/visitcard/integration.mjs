import {hasTemporaryChatWork} from './chat-preview.mjs';
import {hasTemporaryEngineWork} from './rio-engine-web.mjs';

const departure = {
  nl: ['Je bent nog bezig.', 'Je hebt een tijdelijk gesprek, concept of oefening op deze pagina. Open de volgende plek in een nieuw tabblad om hier verder te kunnen. Je tekst gaat niet mee. Herladen of sluiten kan je werk wissen.', 'Volgende plek:', 'Blijf hier', 'Open in nieuw tabblad'],
  en: ['You are still working here.', 'You have a temporary conversation, draft or exercise on this page. Open the next place in a new tab to continue here. Your text does not travel with you. Reloading or closing may clear your work.', 'Next place:', 'Stay here', 'Open in a new tab'],
  de: ['Du bist hier noch beschäftigt.', 'Du hast ein vorübergehendes Gespräch, einen Entwurf oder eine Übung auf dieser Seite. Öffne den nächsten Ort in einem neuen Tab, um hier weitermachen zu können. Dein Text wird nicht übertragen. Neuladen oder Schließen kann deine Arbeit löschen.', 'Nächster Ort:', 'Hier bleiben', 'In neuem Tab öffnen'],
  fr: ['Vous travaillez encore ici.', 'Vous avez une conversation, un brouillon ou un exercice temporaire sur cette page. Ouvrez la suite dans un nouvel onglet pour pouvoir continuer ici. Votre texte ne sera pas transféré. Recharger ou fermer peut effacer votre travail.', 'Prochaine étape :', 'Rester ici', 'Ouvrir dans un nouvel onglet'],
  es: ['Todavía estás trabajando aquí.', 'Tienes una conversación, un borrador o un ejercicio temporal en esta página. Abre el siguiente lugar en otra pestaña para poder continuar aquí. Tu texto no se transfiere. Recargar o cerrar puede borrar tu trabajo.', 'Siguiente lugar:', 'Quedarme aquí', 'Abrir en otra pestaña'],
  ar: ['ما زلت تعمل هنا.', 'لديك محادثة أو مسودة أو تجربة مؤقتة في هذه الصفحة. افتح المكان التالي في علامة تبويب جديدة لتتمكن من المتابعة هنا. لن ينتقل نصك معك. قد تؤدي إعادة التحميل أو الإغلاق إلى مسح عملك.', 'المكان التالي:', 'البقاء هنا', 'افتح في علامة تبويب جديدة'],
  zh: ['你还在这里进行练习。', '此页面上有临时对话、草稿或练习。请在新标签页中打开下一处，以便继续使用此页面。你的文字不会随之转移。重新加载或关闭可能会清除你的内容。', '下一处：', '留在这里', '在新标签页中打开'],
};
const departureFields = ['title', 'warning', 'destination', 'stay', 'open'];
const departureDialog = document.getElementById('rio-departure-dialog');
const departureLink = document.getElementById('rio-departure-new-tab');
let departureTrigger;

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
  departureFields.forEach((field, index) => {
    departureDialog.querySelector('[data-rio-departure="' + field + '"]').textContent = departure[language][index];
  });
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

const externalDestinations = new Set([
  'https://palaco.mauritsvang1.chatgpt.site/',
  'https://citadel.mauritsvang1.chatgpt.site/',
  'https://palaco.mauritsvang1.chatgpt.site/account.html',
]);

function checkedDestination(link) {
  let url;
  try { url = new URL(link.href); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  if (link.id === 'rio-unified-reception' && url.origin === location.origin
      && url.pathname === '/rio/reception/' && !url.search
      && /^#nova-explained:(nl|en|de|fr|es|ar|zh)$/.test(url.hash)) return url;
  if (link.id === 'rio-unified-offline' && url.origin === location.origin
      && url.pathname === '/rio/' && !url.search && !url.hash) {
    // Reuse the app's existing language parser. A noopener tab does not inherit
    // per-tab preferences; only a known public language code crosses this link.
    url.searchParams.set('lang', Object.hasOwn(departure, document.documentElement.lang)
      ? document.documentElement.lang : 'nl');
    return url;
  }
  return link.matches('.taskbar a') && externalDestinations.has(url.href) ? url : null;
}

function destinationName(link) {
  const label = link.querySelector('.taskbar-label');
  if (!label) return link.textContent.trim();
  const caption = label.querySelector('.taskbar-full-label') ?? label;
  const detail = link.querySelector('.taskbar-detail');
  return [caption.textContent, detail?.textContent]
    .map(part => part?.trim()).filter(Boolean).join(' ');
}

document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('#rio-unified-reception, #rio-unified-offline, .taskbar a');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const destination = checkedDestination(link);
  if (!destination || !(hasTemporaryChatWork() || hasTemporaryEngineWork()) || departureDialog.open) return;
  event.preventDefault();
  departureTrigger = link;
  departureLink.href = destination.href;
  document.getElementById('rio-departure-name').textContent = destinationName(link);
  document.getElementById('rio-departure-origin').textContent = destination.origin;
  departureDialog.showModal();
});

function finishDeparture() {
  if (!departureDialog.open) return;
  const trigger = departureTrigger;
  departureTrigger = undefined;
  departureDialog.close();
  // Finish focus with the action; a later close event must not move it again.
  trigger?.focus({preventScroll:true});
}

document.getElementById('rio-departure-stay').addEventListener('click', finishDeparture);
departureLink.addEventListener('click', event => {
  if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) finishDeparture();
});
departureDialog.addEventListener('click', event => {
  if (event.target !== departureDialog) return;
  const rect = departureDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finishDeparture();
});
departureDialog.addEventListener('cancel', event => {
  event.preventDefault();
  finishDeparture();
});

departureDialog.addEventListener('close', () => {
  // A previous queued close must not clear a newly opened choice.
  if (departureDialog.open) return;
  // Retain href until the native target=_blank click default has run.
  departureLink.removeAttribute('href');
  document.getElementById('rio-departure-name').textContent = '';
  document.getElementById('rio-departure-origin').textContent = '';
});
