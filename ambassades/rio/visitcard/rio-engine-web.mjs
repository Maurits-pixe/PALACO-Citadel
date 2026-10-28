import {
  addMemory,
  answerQuestion,
  createDossier,
  disposeSessionDossier,
  grantDossierConsent
} from "./engine.mjs";

const copy = {
  nl: {
    title: "Vraag. Bewijs. Antwoord.", intro: "Geef RIO één herinnering. Stel daarna een vraag. RIO citeert jouw bron of zegt eerlijk dat bewijs ontbreekt.",
    sessionOnly: "Alleen deze sessie", sessionDetail: "Niets wordt online gezet. Herladen wist dit dossier.",
    memoryLabel: "Wat mag RIO tijdelijk onthouden?", memoryPlaceholder: "Bijvoorbeeld: Mijn afspraak is dinsdag om 10 uur.",
    consent: "Ik geef toestemming om dit alleen in deze geopende pagina te gebruiken voor mijn vragen.", remember: "Onthoud tijdelijk",
    consentRequired: "Toestemming en een herinnering zijn nodig.", questionLabel: "Wat wil je vragen?", questionPlaceholder: "Wanneer is mijn afspraak?",
    ask: "Vraag RIO", sources: "Bronnen", detailsTitle: "Wat deze proef wel en niet doet",
    detailsBody: "Geheugen is geen waarheid. Een antwoord is geen besluit. Permanente opslag, ID-koppeling, modeltraining en uitvoering blijven uit en vereisen aparte controle.",
    ready: "Klaar voor vragen. Sessie-ID", supported: "ANTWOORD MET BEWIJS", insufficient: "ONVOLDOENDE BEWIJS", failed: "RIO stopte veilig:",
    insufficientAnswer: "RIO heeft binnen dit dossier onvoldoende bewijs om deze vraag te beantwoorden.",
    clear: "Maak oefening leeg", clearTitle: "Deze oefening leegmaken?", clearWarning: "Dit maakt de herinnering, concepten en antwoorden van deze oefening leeg. Je tijdelijke chat en onderwerp blijven staan. Je kunt dit niet ongedaan maken.",
    clearCancel: "Oefening behouden", clearConfirm: "Ja, maak deze oefening leeg", cleared: "Oefening is leeg. Geef opnieuw toestemming en een herinnering."
  },
  en: {
    title: "Ask. Evidence. Answer.", intro: "Give RIO one memory, then ask a question. RIO cites your source or honestly says evidence is missing.",
    sessionOnly: "This session only", sessionDetail: "Nothing is uploaded. Reloading clears this dossier.",
    memoryLabel: "What may RIO remember temporarily?", memoryPlaceholder: "For example: My appointment is Tuesday at 10.",
    consent: "I consent to using this only in this open page for my questions.", remember: "Remember temporarily",
    consentRequired: "Consent and one memory are required.", questionLabel: "What do you want to ask?", questionPlaceholder: "When is my appointment?",
    ask: "Ask RIO", sources: "Sources", detailsTitle: "What this trial does and does not do",
    detailsBody: "Memory is not truth. An answer is not a decision. Persistent storage, ID linking, model training, and execution remain disabled and require separate review.",
    ready: "Ready for questions. Session ID", supported: "ANSWER WITH EVIDENCE", insufficient: "INSUFFICIENT EVIDENCE", failed: "RIO stopped safely:",
    insufficientAnswer: "RIO has insufficient evidence in this dossier to answer this question.",
    clear: "Empty exercise", clearTitle: "Empty this exercise?", clearWarning: "This empties this exercise's memory, drafts and answers. Your temporary chat and subject stay. You cannot undo this.",
    clearCancel: "Keep exercise", clearConfirm: "Yes, empty this exercise", cleared: "Exercise is empty. Give consent and a memory again."
  },
  de: {
    title: "Frage. Beleg. Antwort.", intro: "Gib RIO eine Erinnerung und stelle dann eine Frage. RIO nennt deine Quelle oder sagt ehrlich, dass Belege fehlen.",
    sessionOnly: "Nur diese Sitzung", sessionDetail: "Nichts wird hochgeladen. Neuladen löscht dieses Dossier.",
    memoryLabel: "Was darf RIO vorübergehend behalten?", memoryPlaceholder: "Zum Beispiel: Mein Termin ist Dienstag um 10 Uhr.",
    consent: "Ich stimme zu, dass dies nur auf dieser geöffneten Seite für meine Fragen genutzt wird.", remember: "Vorübergehend merken",
    consentRequired: "Zustimmung und eine Erinnerung sind erforderlich.", questionLabel: "Was möchtest du fragen?", questionPlaceholder: "Wann ist mein Termin?",
    ask: "RIO fragen", sources: "Quellen", detailsTitle: "Was dieser Test tut und nicht tut",
    detailsBody: "Erinnerung ist keine Wahrheit. Eine Antwort ist keine Entscheidung. Dauerhafte Speicherung, ID-Verknüpfung, Modelltraining und Ausführung bleiben aus und benötigen eine separate Prüfung.",
    ready: "Bereit für Fragen. Sitzungs-ID", supported: "ANTWORT MIT BELEG", insufficient: "UNZUREICHENDE BELEGE", failed: "RIO stoppte sicher:",
    insufficientAnswer: "RIO hat in diesem Dossier nicht genügend Belege, um diese Frage zu beantworten.",
    clear: "Übung leeren", clearTitle: "Diese Übung leeren?", clearWarning: "Dies leert die Erinnerung, Entwürfe und Antworten dieser Übung. Dein vorübergehender Chat und dein Thema bleiben bestehen. Du kannst dies nicht rückgängig machen.",
    clearCancel: "Übung behalten", clearConfirm: "Ja, diese Übung leeren", cleared: "Die Übung ist leer. Gib erneut deine Zustimmung und eine Erinnerung."
  },
  fr: {
    title: "Question. Preuve. Réponse.", intro: "Donnez un souvenir à RIO, puis posez une question. RIO cite votre source ou indique honnêtement que la preuve manque.",
    sessionOnly: "Cette session seulement", sessionDetail: "Rien n'est envoyé. Recharger efface ce dossier.",
    memoryLabel: "Que peut retenir RIO temporairement ?", memoryPlaceholder: "Par exemple : Mon rendez-vous est mardi à 10 h.",
    consent: "J'accepte que ceci soit utilisé uniquement dans cette page ouverte pour mes questions.", remember: "Retenir temporairement",
    consentRequired: "Un consentement et un souvenir sont nécessaires.", questionLabel: "Que voulez-vous demander ?", questionPlaceholder: "Quand est mon rendez-vous ?",
    ask: "Demander à RIO", sources: "Sources", detailsTitle: "Ce que fait et ne fait pas cet essai",
    detailsBody: "La mémoire n'est pas la vérité. Une réponse n'est pas une décision. Le stockage permanent, la liaison d'identité, l'entraînement et l'exécution restent désactivés et exigent un contrôle séparé.",
    ready: "Prêt pour les questions. ID de session", supported: "RÉPONSE AVEC PREUVE", insufficient: "PREUVE INSUFFISANTE", failed: "RIO s'est arrêté en sécurité :",
    insufficientAnswer: "RIO ne dispose pas de preuves suffisantes dans ce dossier pour répondre à cette question.",
    clear: "Vider l’exercice", clearTitle: "Vider cet exercice ?", clearWarning: "Cela vide le souvenir, les brouillons et les réponses de cet exercice. Votre chat temporaire et votre sujet restent en place. Cette action est irréversible.",
    clearCancel: "Conserver l’exercice", clearConfirm: "Oui, vider cet exercice", cleared: "L’exercice est vide. Donnez à nouveau votre consentement et un souvenir."
  },
  es: {
    title: "Pregunta. Prueba. Respuesta.", intro: "Dale a RIO un recuerdo y luego haz una pregunta. RIO cita tu fuente o dice con claridad que faltan pruebas.",
    sessionOnly: "Solo esta sesión", sessionDetail: "Nada se sube. Recargar borra este expediente.",
    memoryLabel: "¿Qué puede recordar RIO temporalmente?", memoryPlaceholder: "Por ejemplo: Mi cita es el martes a las 10.",
    consent: "Acepto usar esto solo en esta página abierta para mis preguntas.", remember: "Recordar temporalmente",
    consentRequired: "Se necesitan consentimiento y un recuerdo.", questionLabel: "¿Qué quieres preguntar?", questionPlaceholder: "¿Cuándo es mi cita?",
    ask: "Preguntar a RIO", sources: "Fuentes", detailsTitle: "Qué hace y qué no hace esta prueba",
    detailsBody: "La memoria no es verdad. Una respuesta no es una decisión. El almacenamiento permanente, la vinculación de ID, el entrenamiento y la ejecución siguen desactivados y requieren revisión aparte.",
    ready: "Listo para preguntas. ID de sesión", supported: "RESPUESTA CON PRUEBAS", insufficient: "PRUEBAS INSUFICIENTES", failed: "RIO se detuvo de forma segura:",
    insufficientAnswer: "RIO no tiene pruebas suficientes en este expediente para responder a esta pregunta.",
    clear: "Vaciar ejercicio", clearTitle: "¿Vaciar este ejercicio?", clearWarning: "Esto vacía el recuerdo, los borradores y las respuestas de este ejercicio. Tu chat temporal y tu tema se conservan. No se puede deshacer.",
    clearCancel: "Conservar ejercicio", clearConfirm: "Sí, vaciar este ejercicio", cleared: "El ejercicio está vacío. Da tu consentimiento y un recuerdo de nuevo."
  },
  it: {
    title: "Domanda. Prova. Risposta.", intro: "Fornisci a RIO un ricordo, poi fai una domanda. RIO cita la tua fonte oppure dice con chiarezza che mancano prove.",
    sessionOnly: "Solo questa sessione", sessionDetail: "Non viene caricato nulla online. Ricaricare la pagina cancella questo dossier.",
    memoryLabel: "Cosa può ricordare RIO temporaneamente?", memoryPlaceholder: "Per esempio: Il mio appuntamento è martedì alle dieci.",
    consent: "Acconsento a usare questo solo in questa pagina aperta per rispondere alle mie domande.", remember: "Ricorda temporaneamente",
    consentRequired: "Servono il consenso e un ricordo.", questionLabel: "Cosa vuoi chiedere?", questionPlaceholder: "Quando è il mio appuntamento?",
    ask: "Chiedi a RIO", sources: "Fonti", detailsTitle: "Cosa fa e cosa non fa questa prova",
    detailsBody: "La memoria non è verità. Una risposta non è una decisione. L’archiviazione permanente, il collegamento all’ID, l’addestramento dei modelli e l’esecuzione restano disattivati e richiedono una verifica separata.",
    ready: "Pronto per le domande. ID di sessione", supported: "RISPOSTA CON PROVE", insufficient: "PROVE INSUFFICIENTI", failed: "RIO si è fermato in sicurezza:",
    insufficientAnswer: "RIO non ha prove sufficienti in questo dossier per rispondere a questa domanda.",
    clear: "Svuota esercizio", clearTitle: "Svuotare questo esercizio?", clearWarning: "Questa azione elimina il ricordo, le bozze e le risposte di questo esercizio. La chat temporanea e l’argomento restano. Non puoi annullarla.",
    clearCancel: "Mantieni l’esercizio", clearConfirm: "Sì, svuota questo esercizio", cleared: "L’esercizio è vuoto. Dai nuovamente il consenso e inserisci un ricordo."
  },
  pt: {
    title: "Pergunta. Prova. Resposta.", intro: "Dê uma lembrança ao RIO e depois faça uma pergunta. O RIO cita a sua fonte ou diz com clareza que faltam provas.",
    sessionOnly: "Só nesta sessão", sessionDetail: "Nada é enviado. Recarregar apaga este dossier.",
    memoryLabel: "O que pode o RIO lembrar temporariamente?", memoryPlaceholder: "Por exemplo: A minha consulta é na terça-feira às 10 horas.",
    consent: "Autorizo o uso disto apenas nesta página aberta para responder às minhas perguntas.", remember: "Lembrar temporariamente",
    consentRequired: "São necessários consentimento e uma lembrança.", questionLabel: "O que quer perguntar?", questionPlaceholder: "Quando é a minha consulta?",
    ask: "Perguntar ao RIO", sources: "Fontes", detailsTitle: "O que este teste faz e não faz",
    detailsBody: "Memória não é verdade. Uma resposta não é uma decisão. O armazenamento permanente, a ligação de ID, o treino de modelos e a execução continuam desativados e exigem revisão separada.",
    ready: "Pronto para perguntas. ID da sessão", supported: "RESPOSTA COM PROVAS", insufficient: "PROVAS INSUFICIENTES", failed: "O RIO parou em segurança:",
    insufficientAnswer: "O RIO não tem provas suficientes neste dossier para responder a esta pergunta.",
    clear: "Esvaziar exercício", clearTitle: "Esvaziar este exercício?", clearWarning: "Isto apaga a lembrança, os rascunhos e as respostas deste exercício. A conversa temporária e o assunto são mantidos. Esta ação não pode ser desfeita.",
    clearCancel: "Manter o exercício", clearConfirm: "Sim, esvaziar este exercício", cleared: "O exercício está vazio. Dê novamente consentimento e uma lembrança."
  },
  ru: {
    title: "Вопрос. Доказательство. Ответ.", intro: "Дайте RIO одно воспоминание, затем задайте вопрос. RIO процитирует ваш источник или честно скажет, что доказательств недостаточно.",
    sessionOnly: "Только этот сеанс", sessionDetail: "Ничего не загружается. Перезагрузка удалит это досье.",
    memoryLabel: "Что RIO может временно запомнить?", memoryPlaceholder: "Например: Моя встреча во вторник в 10 часов.",
    consent: "Я разрешаю использовать это только на этой открытой странице для ответов на мои вопросы.", remember: "Временно запомнить",
    consentRequired: "Необходимы согласие и одно воспоминание.", questionLabel: "Что вы хотите спросить?", questionPlaceholder: "Когда моя встреча?",
    ask: "Спросить RIO", sources: "Источники", detailsTitle: "Что делает и чего не делает этот тест",
    detailsBody: "Память не равна истине. Ответ не является решением. Постоянное хранение, привязка ID, обучение моделей и выполнение действий остаются отключёнными и требуют отдельной проверки.",
    ready: "Можно задавать вопросы. ID сеанса", supported: "ОТВЕТ С ДОКАЗАТЕЛЬСТВОМ", insufficient: "НЕДОСТАТОЧНО ДОКАЗАТЕЛЬСТВ", failed: "RIO безопасно остановлен:",
    insufficientAnswer: "В этом досье у RIO недостаточно доказательств, чтобы ответить на этот вопрос.",
    clear: "Очистить упражнение", clearTitle: "Очистить это упражнение?", clearWarning: "Будут удалены воспоминание, черновики и ответы этого упражнения. Временный чат и тема сохранятся. Отменить это действие нельзя.",
    clearCancel: "Сохранить упражнение", clearConfirm: "Да, очистить это упражнение", cleared: "Упражнение очищено. Снова дайте согласие и добавьте воспоминание."
  },
  eo: {
    title: "Demando. Pruvo. Respondo.", intro: "Donu unu memoraĵon al RIO, poste faru demandon. RIO citas vian fonton aŭ honeste diras, ke pruvo mankas.",
    sessionOnly: "Nur ĉi tiu seanco", sessionDetail: "Nenio estas alŝutata. Reŝargo forviŝas ĉi tiun dosieron.",
    memoryLabel: "Kion RIO rajtas provizore memori?", memoryPlaceholder: "Ekzemple: Mia rendevuo estas marde je la 10-a.",
    consent: "Mi konsentas uzi tion nur en ĉi tiu malfermita paĝo por miaj demandoj.", remember: "Memori provizore",
    consentRequired: "Necesas konsento kaj unu memoraĵo.", questionLabel: "Kion vi volas demandi?", questionPlaceholder: "Kiam estas mia rendevuo?",
    ask: "Demandi RIO", sources: "Fontoj", detailsTitle: "Kion ĉi tiu provo faras kaj ne faras",
    detailsBody: "Memoro ne estas vero. Respondo ne estas decido. Daŭra konservado, identigila ligado, modeltrejnado kaj plenumado restas malŝaltitaj kaj postulas apartan kontrolon.",
    ready: "Preta por demandoj. Seanca identigilo", supported: "RESPONDO KUN PRUVO", insufficient: "NESUFIĈA PRUVO", failed: "RIO haltis sekure:",
    insufficientAnswer: "RIO ne havas sufiĉan pruvon en ĉi tiu dosiero por respondi ĉi tiun demandon.",
    clear: "Malplenigi ekzercon", clearTitle: "Ĉu malplenigi ĉi tiun ekzercon?", clearWarning: "Tio forviŝas la memoraĵon, malnetojn kaj respondojn de ĉi tiu ekzerco. Via provizora babilejo kaj temo restas. Tio ne estas malfarebla.",
    clearCancel: "Konservi la ekzercon", clearConfirm: "Jes, malplenigi ĉi tiun ekzercon", cleared: "La ekzerco estas malplena. Denove donu konsenton kaj memoraĵon."
  },
  pl: {
    title: "Pytanie. Dowód. Odpowiedź.", intro: "Przekaż RIO jedno wspomnienie, a potem zadaj pytanie. RIO zacytuje Twoje źródło lub uczciwie powie, że brakuje dowodów.",
    sessionOnly: "Tylko ta sesja", sessionDetail: "Nic nie jest przesyłane. Odświeżenie strony usuwa to dossier.",
    memoryLabel: "Co RIO może tymczasowo zapamiętać?", memoryPlaceholder: "Na przykład: Moje spotkanie jest we wtorek o 10.",
    consent: "Zgadzam się na użycie tego wyłącznie na tej otwartej stronie do odpowiadania na moje pytania.", remember: "Zapamiętaj tymczasowo",
    consentRequired: "Potrzebne są zgoda i jedno wspomnienie.", questionLabel: "O co chcesz zapytać?", questionPlaceholder: "Kiedy jest moje spotkanie?",
    ask: "Zapytaj RIO", sources: "Źródła", detailsTitle: "Co robi ta próba i czego nie robi",
    detailsBody: "Pamięć nie jest prawdą. Odpowiedź nie jest decyzją. Trwałe przechowywanie, łączenie identyfikatorów, trenowanie modeli i wykonywanie działań pozostają wyłączone i wymagają osobnej kontroli.",
    ready: "Możesz zadawać pytania. ID sesji", supported: "ODPOWIEDŹ Z DOWODEM", insufficient: "NIEWYSTARCZAJĄCE DOWODY", failed: "RIO bezpiecznie się zatrzymał:",
    insufficientAnswer: "RIO nie ma w tym dossier wystarczających dowodów, aby odpowiedzieć na to pytanie.",
    clear: "Wyczyść ćwiczenie", clearTitle: "Wyczyścić to ćwiczenie?", clearWarning: "Spowoduje to usunięcie wspomnienia, szkiców i odpowiedzi z tego ćwiczenia. Tymczasowy czat i temat pozostaną. Tej czynności nie można cofnąć.",
    clearCancel: "Zachowaj ćwiczenie", clearConfirm: "Tak, wyczyść to ćwiczenie", cleared: "Ćwiczenie jest puste. Ponownie wyraź zgodę i podaj wspomnienie."
  },
  ar: {
    title: "سؤال. دليل. جواب.", intro: "أعطِ RIO ذكرى واحدة ثم اطرح سؤالاً. يذكر RIO مصدرك أو يقول بوضوح إن الدليل غير كافٍ.",
    sessionOnly: "لهذه الجلسة فقط", sessionDetail: "لن يُرفع شيء. إعادة التحميل تمحو هذا الملف.",
    memoryLabel: "ماذا يمكن لـ RIO أن يتذكر مؤقتاً؟", memoryPlaceholder: "مثال: موعدي يوم الثلاثاء الساعة العاشرة.",
    consent: "أوافق على استخدام هذا داخل هذه الصفحة المفتوحة فقط للإجابة عن أسئلتي.", remember: "تذكّر مؤقتاً",
    consentRequired: "تلزم الموافقة وذكرى واحدة.", questionLabel: "ماذا تريد أن تسأل؟", questionPlaceholder: "متى موعدي؟",
    ask: "اسأل RIO", sources: "المصادر", detailsTitle: "ما الذي يفعله هذا الاختبار وما الذي لا يفعله",
    detailsBody: "الذاكرة ليست حقيقة. والجواب ليس قراراً. يبقى التخزين الدائم وربط الهوية وتدريب النموذج والتنفيذ معطلاً ويتطلب مراجعة منفصلة.",
    ready: "جاهز للأسئلة. معرّف الجلسة", supported: "إجابة مع دليل", insufficient: "دليل غير كافٍ", failed: "توقف RIO بأمان:",
    insufficientAnswer: "لا يملك RIO أدلة كافية في هذا الملف للإجابة عن هذا السؤال.",
    clear: "أفرغ التمرين", clearTitle: "هل تريد إفراغ هذا التمرين؟", clearWarning: "يُفرغ هذا ذكرى التمرين ومسوداته وإجاباته. تبقى الدردشة المؤقتة والموضوع كما هما. لا يمكنك التراجع عن هذا الإجراء.",
    clearCancel: "احتفظ بالتمرين", clearConfirm: "نعم، أفرغ هذا التمرين", cleared: "التمرين فارغ. أعطِ موافقتك وذكرى من جديد."
  },
  zh: {
    title: "提问。证据。回答。", intro: "给 RIO 一条记忆，然后提问。RIO 会引用你的来源，或坦诚说明证据不足。",
    sessionOnly: "仅限本次会话", sessionDetail: "不会上传任何内容。刷新页面会清除此档案。",
    memoryLabel: "RIO 可以临时记住什么？", memoryPlaceholder: "例如：我的预约是星期二上午十点。",
    consent: "我同意仅在这个已打开的页面中使用它来回答我的问题。", remember: "临时记住",
    consentRequired: "需要同意并提供一条记忆。", questionLabel: "你想问什么？", questionPlaceholder: "我的预约是什么时候？",
    ask: "询问 RIO", sources: "来源", detailsTitle: "此试用会做什么、不会做什么",
    detailsBody: "记忆不等于真相。回答不等于决定。持久存储、身份关联、模型训练和执行均保持关闭，并需要单独审查。",
    ready: "可以提问。会话 ID", supported: "有证据的回答", insufficient: "证据不足", failed: "RIO 已安全停止：",
    insufficientAnswer: "RIO 在此档案中没有足够的证据来回答这个问题。",
    clear: "清空练习", clearTitle: "清空此练习？", clearWarning: "这会清空此练习的记忆、草稿和回答。你的临时聊天和主题会保留。此操作无法撤销。",
    clearCancel: "保留练习", clearConfirm: "是的，清空此练习", cleared: "练习已清空。请重新同意并提供一条记忆。"
  }
};

const memoryForm = document.querySelector("#memory-form");
const memoryInput = document.querySelector("#memory-input");
const memoryConsent = document.querySelector("#memory-consent");
const questionForm = document.querySelector("#question-form");
const questionInput = document.querySelector("#question-input");
const questionButton = questionForm?.querySelector("button");
const dossierOutput = document.querySelector("#dossier-output");
const answerPanel = document.querySelector("#engine-answer");
const answerState = document.querySelector("#engine-answer-state");
const answerText = document.querySelector("#engine-answer-text");
const answerSources = document.querySelector("#engine-answer-sources");
const clearButton = document.querySelector("#engine-clear");
const clearDialog = document.querySelector("#engine-clear-dialog");

let language = document.documentElement.lang || "nl";
let dossier;
export const hasTemporaryEngineWork = () => Boolean(dossier || memoryInput.value.trim() || questionInput.value.trim());
let sequence = 0;
const suffix = crypto.randomUUID();
const owner = `participant:local:${suffix}`;
const now = () => new Date(Date.now() + sequence++).toISOString();
const id = (kind) => `rio:${kind}:${crypto.randomUUID()}`;
const t = (key) => (copy[language] ?? copy.en)[key];
const record = (recordedAt) => ({
  record_id: `web-prov-${crypto.randomUUID()}`,
  recorded_at: recordedAt,
  actor_ref: owner,
  source: "rio-web-session",
  source_revision: "1.0.0"
});

function translate(nextLanguage) {
  language = copy[nextLanguage] ? nextLanguage : "en";
  document.querySelectorAll("[data-engine-i18n]").forEach((element) => {
    const value = t(element.dataset.engineI18n);
    if (element.textContent !== value) element.textContent = value;
  });
  document.querySelectorAll("[data-engine-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.engineI18nPlaceholder);
  });
  if (dossier) dossierOutput.textContent = `${t("ready")}: ${dossier.dossier_id}`;
  updateAnswerLanguage();
}

function updateAnswerLanguage() {
  if (answerPanel.hidden) return;
  const fixedCopy = answerText.dataset.engineI18n === "insufficientAnswer";
  // A visitor's quoted source has an unknown language, independent of the UI.
  answerText.lang = fixedCopy ? language : "";
  answerText.dir = fixedCopy ? (language === "ar" ? "rtl" : "ltr") : "auto";
}

function showFailure(errors) {
  dossierOutput.dataset.state = "STOPPED";
  dossierOutput.textContent = `${t("failed")} ${errors.join("; ")}`;
}

memoryForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const createdAt = now();
  const created = createDossier({
    dossier_id: id("dossier"),
    identity_id: id("identity"),
    owner_participant_id: owner,
    purpose_scope: "session-only personal question and answer",
    created_at: createdAt,
    record_id: `web-prov-${crypto.randomUUID()}`,
    source: "rio-web-session",
    source_revision: "1.0.0"
  });
  if (!created.ok) return showFailure(created.errors);

  const consentTime = now();
  const consented = grantDossierConsent(created.dossier, {
    consent_id: `web-consent-${crypto.randomUUID()}`,
    scope: ["STORE_MEMORY", "QUERY_MEMORY"],
    purpose: "session-only personal question and answer",
    valid_from: consentTime,
    valid_until: null
  }, record(consentTime));
  if (!consented.ok) {
    disposeSessionDossier(created.dossier);
    return showFailure(consented.errors);
  }

  const capturedAt = now();
  const remembered = addMemory(consented.dossier, {
    memory_id: id("memory"),
    content: memoryInput.value.trim(),
    source_ref: "user:direct-input",
    source_revision: "1",
    captured_at: capturedAt,
    purpose: "session-only personal question and answer",
    sensitivity: "PRIVATE",
    retention_until: null
  }, record(capturedAt));
  if (!remembered.ok) {
    disposeSessionDossier(consented.dossier);
    return showFailure(remembered.errors);
  }

  // A successful replacement must also retire the previous core snapshot;
  // dropping this module's old reference alone would retain its private text.
  if (dossier) {
    const released = disposeSessionDossier(dossier);
    if (!released.ok) {
      disposeSessionDossier(remembered.dossier);
      return showFailure(released.errors);
    }
  }

  dossier = remembered.dossier;
  clearAnswer();
  memoryInput.value = "";
  memoryConsent.checked = false;
  questionInput.disabled = false;
  questionButton.disabled = false;
  dossierOutput.dataset.engineI18n = "consentRequired";
  dossierOutput.dataset.state = "READY";
  dossierOutput.textContent = `${t("ready")}: ${dossier.dossier_id}`;
  questionInput.focus();
});

questionForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!dossier) return;
  const askedAt = now();
  const answered = answerQuestion(dossier, {
    question_id: id("question"),
    requester_participant_id: owner,
    purpose: "session-only personal question and answer",
    asked_at: askedAt,
    text: questionInput.value.trim()
  }, record(askedAt));
  if (!answered.ok) return showFailure(answered.errors);
  dossier = answered.dossier;
  answerPanel.hidden = false;
  const supported = answered.result.status === "ANSWER_SUPPORTED";
  answerState.dataset.engineI18n = supported ? "supported" : "insufficient";
  answerState.textContent = t(answerState.dataset.engineI18n);
  if (supported) delete answerText.dataset.engineI18n;
  else answerText.dataset.engineI18n = "insufficientAnswer";
  answerText.textContent = supported ? answered.result.answer : t("insufficientAnswer");
  updateAnswerLanguage();
  answerSources.textContent = answered.result.citations.length > 0 ? answered.result.citations.join(", ") : "—";
});

function clearAnswer() {
  answerPanel.hidden = true;
  // A later language choice must not repopulate cleared presentation fields.
  delete answerState.dataset.engineI18n;
  delete answerText.dataset.engineI18n;
  answerState.textContent = "";
  answerText.textContent = "";
  answerText.removeAttribute("lang");
  answerText.removeAttribute("dir");
  answerSources.textContent = "";
}

function finishClear(confirmed) {
  if (confirmed) {
    // Release this exercise's state and remove its visible private content.
    // This does not access the separate chat or promise secure memory erasure.
    const released = dossier ? disposeSessionDossier(dossier) : { ok: true };
    if (!released.ok) {
      showFailure(released.errors);
      clearDialog.close("cancel");
      focusAfterClear(false);
      return;
    }
    dossier = undefined;
    memoryForm.reset();
    questionForm.reset();
    memoryInput.value = "";
    questionInput.value = "";
    memoryConsent.checked = false;
    memoryInput.setCustomValidity("");
    questionInput.setCustomValidity("");
    questionInput.disabled = true;
    questionButton.disabled = true;
    clearAnswer();
    dossierOutput.dataset.state = "CONSENT_REQUIRED";
    dossierOutput.dataset.engineI18n = "cleared";
    dossierOutput.textContent = t("cleared");
  }
  clearDialog.close(confirmed ? "confirm" : "cancel");
  // Complete state and focus together; no later close-event work can steal
  // focus from the user's next action.
  focusAfterClear(confirmed);
}

function focusAfterClear(confirmed) {
  // An open fixed chat can cover the workspace. Keep its state and content,
  // but return to its explicit close control instead of a covered root field.
  const chatOpen = document.querySelector("#chat-preview-panel")?.hidden === false;
  const target = chatOpen ? document.querySelector("#chat-preview-close") : confirmed ? memoryInput : clearButton;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: "instant", block: chatOpen ? "nearest" : "center", inline: "nearest" });
}

clearButton.addEventListener("click", () => {
  clearDialog.returnValue = "";
  clearDialog.showModal();
});
document.querySelector("#engine-clear-form").addEventListener("submit", event => {
  event.preventDefault();
  finishClear(event.submitter?.value === "confirm");
});
clearDialog.addEventListener("cancel", event => {
  event.preventDefault();
  finishClear(false);
});
clearDialog.addEventListener("click", event => {
  if (event.target !== clearDialog) return;
  const rect = clearDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finishClear(false);
});

window.addEventListener("rio:languagechange", (event) => translate(event.detail.language));
translate(language);
clearButton.disabled = false;
