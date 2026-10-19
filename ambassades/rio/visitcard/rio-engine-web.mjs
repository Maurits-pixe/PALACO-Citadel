import {
  addMemory,
  answerQuestion,
  createDossier,
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
    ready: "Klaar voor vragen. Sessie-ID", supported: "ANTWOORD MET BEWIJS", insufficient: "ONVOLDOENDE BEWIJS", failed: "RIO stopte veilig:"
  },
  en: {
    title: "Ask. Evidence. Answer.", intro: "Give RIO one memory, then ask a question. RIO cites your source or honestly says evidence is missing.",
    sessionOnly: "This session only", sessionDetail: "Nothing is uploaded. Reloading clears this dossier.",
    memoryLabel: "What may RIO remember temporarily?", memoryPlaceholder: "For example: My appointment is Tuesday at 10.",
    consent: "I consent to using this only in this open page for my questions.", remember: "Remember temporarily",
    consentRequired: "Consent and one memory are required.", questionLabel: "What do you want to ask?", questionPlaceholder: "When is my appointment?",
    ask: "Ask RIO", sources: "Sources", detailsTitle: "What this trial does and does not do",
    detailsBody: "Memory is not truth. An answer is not a decision. Persistent storage, ID linking, model training, and execution remain disabled and require separate review.",
    ready: "Ready for questions. Session ID", supported: "ANSWER WITH EVIDENCE", insufficient: "INSUFFICIENT EVIDENCE", failed: "RIO stopped safely:"
  },
  de: {
    title: "Frage. Beleg. Antwort.", intro: "Gib RIO eine Erinnerung und stelle dann eine Frage. RIO nennt deine Quelle oder sagt ehrlich, dass Belege fehlen.",
    sessionOnly: "Nur diese Sitzung", sessionDetail: "Nichts wird hochgeladen. Neuladen löscht dieses Dossier.",
    memoryLabel: "Was darf RIO vorübergehend behalten?", memoryPlaceholder: "Zum Beispiel: Mein Termin ist Dienstag um 10 Uhr.",
    consent: "Ich stimme zu, dass dies nur auf dieser geöffneten Seite für meine Fragen genutzt wird.", remember: "Vorübergehend merken",
    consentRequired: "Zustimmung und eine Erinnerung sind erforderlich.", questionLabel: "Was möchtest du fragen?", questionPlaceholder: "Wann ist mein Termin?",
    ask: "RIO fragen", sources: "Quellen", detailsTitle: "Was dieser Test tut und nicht tut",
    detailsBody: "Erinnerung ist keine Wahrheit. Eine Antwort ist keine Entscheidung. Dauerhafte Speicherung, ID-Verknüpfung, Modelltraining und Ausführung bleiben aus und benötigen eine separate Prüfung.",
    ready: "Bereit für Fragen. Sitzungs-ID", supported: "ANTWORT MIT BELEG", insufficient: "UNZUREICHENDE BELEGE", failed: "RIO stoppte sicher:"
  },
  fr: {
    title: "Question. Preuve. Réponse.", intro: "Donnez un souvenir à RIO, puis posez une question. RIO cite votre source ou indique honnêtement que la preuve manque.",
    sessionOnly: "Cette session seulement", sessionDetail: "Rien n'est envoyé. Recharger efface ce dossier.",
    memoryLabel: "Que peut retenir RIO temporairement ?", memoryPlaceholder: "Par exemple : Mon rendez-vous est mardi à 10 h.",
    consent: "J'accepte que ceci soit utilisé uniquement dans cette page ouverte pour mes questions.", remember: "Retenir temporairement",
    consentRequired: "Un consentement et un souvenir sont nécessaires.", questionLabel: "Que voulez-vous demander ?", questionPlaceholder: "Quand est mon rendez-vous ?",
    ask: "Demander à RIO", sources: "Sources", detailsTitle: "Ce que fait et ne fait pas cet essai",
    detailsBody: "La mémoire n'est pas la vérité. Une réponse n'est pas une décision. Le stockage permanent, la liaison d'identité, l'entraînement et l'exécution restent désactivés et exigent un contrôle séparé.",
    ready: "Prêt pour les questions. ID de session", supported: "RÉPONSE AVEC PREUVE", insufficient: "PREUVE INSUFFISANTE", failed: "RIO s'est arrêté en sécurité :"
  },
  es: {
    title: "Pregunta. Prueba. Respuesta.", intro: "Dale a RIO un recuerdo y luego haz una pregunta. RIO cita tu fuente o dice con claridad que faltan pruebas.",
    sessionOnly: "Solo esta sesión", sessionDetail: "Nada se sube. Recargar borra este expediente.",
    memoryLabel: "¿Qué puede recordar RIO temporalmente?", memoryPlaceholder: "Por ejemplo: Mi cita es el martes a las 10.",
    consent: "Acepto usar esto solo en esta página abierta para mis preguntas.", remember: "Recordar temporalmente",
    consentRequired: "Se necesitan consentimiento y un recuerdo.", questionLabel: "¿Qué quieres preguntar?", questionPlaceholder: "¿Cuándo es mi cita?",
    ask: "Preguntar a RIO", sources: "Fuentes", detailsTitle: "Qué hace y qué no hace esta prueba",
    detailsBody: "La memoria no es verdad. Una respuesta no es una decisión. El almacenamiento permanente, la vinculación de ID, el entrenamiento y la ejecución siguen desactivados y requieren revisión aparte.",
    ready: "Listo para preguntas. ID de sesión", supported: "RESPUESTA CON PRUEBAS", insufficient: "PRUEBAS INSUFICIENTES", failed: "RIO se detuvo de forma segura:"
  },
  ar: {
    title: "سؤال. دليل. جواب.", intro: "أعطِ RIO ذكرى واحدة ثم اطرح سؤالاً. يذكر RIO مصدرك أو يقول بوضوح إن الدليل غير كافٍ.",
    sessionOnly: "لهذه الجلسة فقط", sessionDetail: "لن يُرفع شيء. إعادة التحميل تمحو هذا الملف.",
    memoryLabel: "ماذا يمكن لـ RIO أن يتذكر مؤقتاً؟", memoryPlaceholder: "مثال: موعدي يوم الثلاثاء الساعة العاشرة.",
    consent: "أوافق على استخدام هذا داخل هذه الصفحة المفتوحة فقط للإجابة عن أسئلتي.", remember: "تذكّر مؤقتاً",
    consentRequired: "تلزم الموافقة وذكرى واحدة.", questionLabel: "ماذا تريد أن تسأل؟", questionPlaceholder: "متى موعدي؟",
    ask: "اسأل RIO", sources: "المصادر", detailsTitle: "ما الذي يفعله هذا الاختبار وما الذي لا يفعله",
    detailsBody: "الذاكرة ليست حقيقة. والجواب ليس قراراً. يبقى التخزين الدائم وربط الهوية وتدريب النموذج والتنفيذ معطلاً ويتطلب مراجعة منفصلة.",
    ready: "جاهز للأسئلة. معرّف الجلسة", supported: "إجابة مع دليل", insufficient: "دليل غير كافٍ", failed: "توقف RIO بأمان:"
  },
  zh: {
    title: "提问。证据。回答。", intro: "给 RIO 一条记忆，然后提问。RIO 会引用你的来源，或坦诚说明证据不足。",
    sessionOnly: "仅限本次会话", sessionDetail: "不会上传任何内容。刷新页面会清除此档案。",
    memoryLabel: "RIO 可以临时记住什么？", memoryPlaceholder: "例如：我的预约是星期二上午十点。",
    consent: "我同意仅在这个已打开的页面中使用它来回答我的问题。", remember: "临时记住",
    consentRequired: "需要同意并提供一条记忆。", questionLabel: "你想问什么？", questionPlaceholder: "我的预约是什么时候？",
    ask: "询问 RIO", sources: "来源", detailsTitle: "此试用会做什么、不会做什么",
    detailsBody: "记忆不等于真相。回答不等于决定。持久存储、身份关联、模型训练和执行均保持关闭，并需要单独审查。",
    ready: "可以提问。会话 ID", supported: "有证据的回答", insufficient: "证据不足", failed: "RIO 已安全停止："
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
    element.textContent = t(element.dataset.engineI18n);
  });
  document.querySelectorAll("[data-engine-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.engineI18nPlaceholder);
  });
  if (dossier) dossierOutput.textContent = `${t("ready")}: ${dossier.dossier_id}`;
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
  if (!consented.ok) return showFailure(consented.errors);

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
  if (!remembered.ok) return showFailure(remembered.errors);

  dossier = remembered.dossier;
  memoryInput.value = "";
  memoryConsent.checked = false;
  questionInput.disabled = false;
  questionButton.disabled = false;
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
  answerState.textContent = answered.result.status === "ANSWER_SUPPORTED" ? t("supported") : t("insufficient");
  answerText.textContent = answered.result.answer;
  answerSources.textContent = answered.result.citations.length > 0 ? answered.result.citations.join(", ") : "—";
});

window.addEventListener("rio:languagechange", (event) => translate(event.detail.language));
translate(language);
