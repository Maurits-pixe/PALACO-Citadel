const DOSSIER_KEYS = [
  "dossier_id", "identity_id", "owner_participant_id", "purpose_scope", "visibility", "created_at",
  "storage_policy", "state", "authority_effect", "consents", "memories",
  "questions", "learning_proposals", "provenance"
];
const CONSENT_SCOPES = new Set([
  "STORE_MEMORY", "QUERY_MEMORY", "PROPOSE_LEARNING", "REVIEW_LEARNING", "EXPORT_DOSSIER"
]);
const WORD_PATTERN = /[\p{L}\p{N}]+/gu;
const STOP_WORDS = new Set([
  "aan", "als", "ben", "bij", "dan", "dat", "de", "dit", "een", "en", "het", "hoe",
  "ik", "in", "is", "je", "mijn", "of", "om", "op", "te", "van", "voor", "wat", "wanneer",
  "a", "am", "and", "are", "at", "how", "i", "in", "is", "my", "of", "on", "the", "to", "what", "when",
  "der", "die", "das", "ein", "eine", "ich", "ist", "mein", "meine", "und", "wann", "was", "wie",
  "de", "des", "est", "et", "je", "la", "le", "les", "ma", "mes", "mon", "quand", "que",
  "como", "cuando", "de", "el", "es", "la", "mi", "mis", "que", "un", "una", "y",
  "mio", "miei", "mie", "tuo", "tua", "tuoi", "tue", "suo", "suoi", "sue", "sono", "sei", "siamo", "siete", "era", "erano", "sarà", "quale", "quali", "chi", "cosa", "come", "dove", "per", "con", "senza", "del", "della", "dello", "dei", "degli", "delle", "alla", "allo", "agli", "alle", "nel", "nella", "nello", "nei", "negli", "nelle", "che",
  "minha", "minhas", "meu", "meus", "sua", "suas", "seu", "seus", "qual", "quais", "quem", "quando", "onde", "uma", "para", "por", "com", "sem", "dos", "das", "são", "sou", "está", "esta", "estão",
  "моя", "мои", "мой", "моё", "мое", "твоя", "твой", "своя", "свой", "какая", "какой", "какое", "какие", "когда", "где", "что", "это", "эта", "этот", "эти", "для", "или", "есть", "был", "была", "будет", "как",
  "mia", "miaj", "via", "viaj", "nia", "niaj", "estas", "estis", "estos", "kiu", "kio", "kiam", "kie", "kiel", "kies", "kiaj", "kiuj", "kaj", "por", "kun", "sen", "unu",
  "moje", "moja", "mój", "moi", "twoje", "twoja", "twój", "swoje", "swoja", "jest", "są", "był", "była", "będzie", "jaki", "jaka", "jakie", "kiedy", "gdzie", "czy", "oraz", "dla", "jak", "ten", "tego", "tej", "też", "się", "nie"
]);
const runtimeStates = new Map();
const DISPOSED_STATE = Symbol("disposed local session dossier");

const clone = (value) => structuredClone(value);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value) => typeof value === "string" && value.trim().length > 0;
const isDateTime = (value) => isString(value) && !Number.isNaN(Date.parse(value));
const unique = (values) => new Set(values).size === values.length;

function canonicalState(value) {
  if (Array.isArray(value)) return value.map(canonicalState);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalState(value[key])]));
}

const serializeState = (value) => JSON.stringify(canonicalState(value));

function checkKeys(value, required, allowed, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  for (const key of required) if (!(key in value)) errors.push(`${path}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} is unknown`);
  return true;
}

function validateRecord(record, path, errors) {
  const keys = ["record_id", "recorded_at", "event", "actor_ref", "source", "source_revision", "previous_record_id"];
  if (!checkKeys(record, keys, keys, path, errors)) return;
  for (const key of ["record_id", "event", "actor_ref", "source", "source_revision"]) {
    if (!isString(record[key])) errors.push(`${path}.${key} is required`);
  }
  if (!isDateTime(record.recorded_at)) errors.push(`${path}.recorded_at must be a date-time`);
  if (record.previous_record_id !== null && !isString(record.previous_record_id)) {
    errors.push(`${path}.previous_record_id must be null or a record ID`);
  }
}

function validateTransitionRecord(record, errors) {
  const keys = ["record_id", "recorded_at", "actor_ref", "source", "source_revision"];
  if (!checkKeys(record, keys, keys, "$transition", errors)) return;
  for (const key of ["record_id", "actor_ref", "source", "source_revision"]) {
    if (!isString(record[key])) errors.push(`$transition.${key} is required`);
  }
  if (!isDateTime(record.recorded_at)) errors.push("$transition.recorded_at must be a date-time");
}

function validateConsent(consent, index, errors) {
  const path = `$.consents[${index}]`;
  const keys = ["consent_id", "scope", "purpose", "valid_from", "valid_until", "state"];
  if (!checkKeys(consent, keys, keys, path, errors)) return;
  if (!isString(consent.consent_id)) errors.push(`${path}.consent_id is required`);
  if (!Array.isArray(consent.scope) || consent.scope.length === 0 || !unique(consent.scope)) {
    errors.push(`${path}.scope must contain unique scopes`);
  } else {
    consent.scope.forEach((scope) => {
      if (!CONSENT_SCOPES.has(scope)) errors.push(`${path}.scope has an unknown value`);
    });
  }
  if (!isString(consent.purpose)) errors.push(`${path}.purpose is required`);
  if (!isDateTime(consent.valid_from)) errors.push(`${path}.valid_from must be a date-time`);
  if (consent.valid_until !== null && !isDateTime(consent.valid_until)) errors.push(`${path}.valid_until must be null or a date-time`);
  if (!["GRANTED", "REVOKED", "EXPIRED"].includes(consent.state)) errors.push(`${path}.state has an unknown value`);
  if (isDateTime(consent.valid_from) && isDateTime(consent.valid_until)
    && Date.parse(consent.valid_from) > Date.parse(consent.valid_until)) {
    errors.push(`${path} has a reversed validity window`);
  }
}

function validateMemory(memory, index, provenanceIds, errors) {
  const path = `$.memories[${index}]`;
  const keys = ["memory_id", "content", "source_ref", "source_revision", "captured_at", "purpose", "sensitivity", "retention_until", "state", "provenance_reference"];
  if (!checkKeys(memory, keys, keys, path, errors)) return;
  if (!/^rio:memory:[A-Za-z0-9._~-]+$/.test(memory.memory_id ?? "")) errors.push(`${path}.memory_id is invalid`);
  for (const key of ["content", "source_ref", "source_revision", "purpose"]) {
    if (!isString(memory[key])) errors.push(`${path}.${key} is required`);
  }
  if (!isDateTime(memory.captured_at)) errors.push(`${path}.captured_at must be a date-time`);
  if (memory.retention_until !== null && !isDateTime(memory.retention_until)) errors.push(`${path}.retention_until must be null or a date-time`);
  if (!["PERSONAL", "PRIVATE", "RESTRICTED"].includes(memory.sensitivity)) errors.push(`${path}.sensitivity has an unknown value`);
  if (!["CURRENT", "CORRECTED", "DISPUTED", "REVOKED", "EXPIRED"].includes(memory.state)) errors.push(`${path}.state has an unknown value`);
  if (!provenanceIds.has(memory.provenance_reference)) errors.push(`${path}.provenance_reference must reference provenance`);
}

function validateQuestion(question, index, provenanceIds, memoryIds, errors) {
  const path = `$.questions[${index}]`;
  const keys = ["question_id", "requester_participant_id", "purpose", "asked_at", "text", "status", "answer", "citations", "authority_effect", "provenance_reference"];
  if (!checkKeys(question, keys, keys, path, errors)) return;
  if (!/^rio:question:[A-Za-z0-9._~-]+$/.test(question.question_id ?? "")) errors.push(`${path}.question_id is invalid`);
  if (!isDateTime(question.asked_at)) errors.push(`${path}.asked_at must be a date-time`);
  if (!isString(question.requester_participant_id) || !isString(question.purpose)
    || !isString(question.text) || !isString(question.answer)) errors.push(`${path} requires requester, purpose, text, and answer`);
  if (!["ANSWER_SUPPORTED", "INSUFFICIENT_EVIDENCE"].includes(question.status)) errors.push(`${path}.status has an unknown value`);
  if (!Array.isArray(question.citations) || !unique(question.citations)) errors.push(`${path}.citations must be unique`);
  for (const citation of question.citations ?? []) if (!memoryIds.has(citation)) errors.push(`${path}.citations must reference memories`);
  if (question.status === "ANSWER_SUPPORTED" && question.citations?.length === 0) errors.push(`${path} supported answer requires citations`);
  if (question.status === "INSUFFICIENT_EVIDENCE" && question.citations?.length !== 0) errors.push(`${path} abstention cannot contain citations`);
  if (question.authority_effect !== "NONE") errors.push(`${path}.authority_effect must be NONE`);
  if (!provenanceIds.has(question.provenance_reference)) errors.push(`${path}.provenance_reference must reference provenance`);
}

function validateLearningProposal(proposal, index, provenanceIds, errors) {
  const path = `$.learning_proposals[${index}]`;
  const keys = ["proposal_id", "content", "source_ref", "source_revision", "purpose", "state", "authority_effect", "provenance_reference"];
  if (!checkKeys(proposal, keys, keys, path, errors)) return;
  if (!/^rio:learning:[A-Za-z0-9._~-]+$/.test(proposal.proposal_id ?? "")) errors.push(`${path}.proposal_id is invalid`);
  for (const key of ["content", "source_ref", "source_revision", "purpose"]) {
    if (!isString(proposal[key])) errors.push(`${path}.${key} is required`);
  }
  if (!["PENDING_REVIEW", "ACCEPTED", "REJECTED", "DISPUTED"].includes(proposal.state)) {
    errors.push(`${path}.state has an unknown value`);
  }
  if (proposal.authority_effect !== "NONE") errors.push(`${path}.authority_effect must be NONE`);
  if (!provenanceIds.has(proposal.provenance_reference)) errors.push(`${path}.provenance_reference must reference provenance`);
}

export function validateDossier(dossier) {
  const errors = [];
  if (!checkKeys(dossier, DOSSIER_KEYS, DOSSIER_KEYS, "$", errors)) return errors;
  if (!/^rio:dossier:[A-Za-z0-9._~-]+$/.test(dossier.dossier_id ?? "")) errors.push("$.dossier_id is invalid");
  if (!/^rio:identity:[A-Za-z0-9._~-]+$/.test(dossier.identity_id ?? "")) errors.push("$.identity_id is invalid");
  if (!isString(dossier.owner_participant_id)) errors.push("$.owner_participant_id is required");
  if (!isString(dossier.purpose_scope)) errors.push("$.purpose_scope is required");
  const visibilityKeys = ["audience_participant_ids", "purpose"];
  if (checkKeys(dossier.visibility, visibilityKeys, visibilityKeys, "$.visibility", errors)) {
    if (!Array.isArray(dossier.visibility.audience_participant_ids)
      || dossier.visibility.audience_participant_ids.length === 0
      || !unique(dossier.visibility.audience_participant_ids)) {
      errors.push("$.visibility.audience_participant_ids must contain unique participants");
    } else if (dossier.visibility.audience_participant_ids.some((participantId) => participantId !== dossier.owner_participant_id)) {
      errors.push("$.visibility is owner-only in the session profile");
    }
    if (dossier.visibility.purpose !== dossier.purpose_scope) errors.push("$.visibility.purpose must match purpose_scope");
  }
  if (!isDateTime(dossier.created_at)) errors.push("$.created_at must be a date-time");
  if (dossier.storage_policy !== "SESSION_ONLY") errors.push("$.storage_policy must be SESSION_ONLY");
  if (!["ACTIVE", "PAUSED", "DISPUTED", "REVOKED"].includes(dossier.state)) errors.push("$.state has an unknown value");
  if (dossier.authority_effect !== "NONE") errors.push("$.authority_effect must be NONE");

  if (!Array.isArray(dossier.provenance) || dossier.provenance.length === 0) {
    errors.push("$.provenance must contain at least one record");
  }
  const provenanceIds = new Set();
  const provenance = Array.isArray(dossier.provenance) ? dossier.provenance : [];
  provenance.forEach((record, index) => {
    validateRecord(record, `$.provenance[${index}]`, errors);
    if (provenanceIds.has(record.record_id)) errors.push(`$.provenance[${index}].record_id must be unique`);
    const previous = provenance[index - 1];
    if (index === 0 && record.previous_record_id !== null) errors.push("$.provenance[0].previous_record_id must be null");
    if (index > 0 && record.previous_record_id !== previous?.record_id) errors.push(`$.provenance[${index}].previous_record_id must reference the previous record`);
    if (index > 0 && isDateTime(record.recorded_at) && isDateTime(previous?.recorded_at)
      && Date.parse(record.recorded_at) < Date.parse(previous.recorded_at)) {
      errors.push(`$.provenance[${index}].recorded_at must not precede the previous record`);
    }
    if (record.actor_ref !== dossier.owner_participant_id) errors.push(`$.provenance[${index}].actor_ref must be the dossier owner`);
    provenanceIds.add(record.record_id);
  });

  if (!Array.isArray(dossier.consents)) errors.push("$.consents must be an array");
  const consentIds = new Set();
  const consents = Array.isArray(dossier.consents) ? dossier.consents : [];
  consents.forEach((consent, index) => {
    validateConsent(consent, index, errors);
    if (consentIds.has(consent.consent_id)) errors.push(`$.consents[${index}].consent_id must be unique`);
    if (consent.purpose !== dossier.purpose_scope) errors.push(`$.consents[${index}].purpose must match purpose_scope`);
    consentIds.add(consent.consent_id);
  });
  if (!Array.isArray(dossier.memories)) errors.push("$.memories must be an array");
  const memoryIds = new Set();
  const memories = Array.isArray(dossier.memories) ? dossier.memories : [];
  memories.forEach((memory, index) => {
    validateMemory(memory, index, provenanceIds, errors);
    if (memoryIds.has(memory.memory_id)) errors.push(`$.memories[${index}].memory_id must be unique`);
    if (memory.purpose !== dossier.purpose_scope) errors.push(`$.memories[${index}].purpose must match purpose_scope`);
    memoryIds.add(memory.memory_id);
  });
  if (!Array.isArray(dossier.questions)) errors.push("$.questions must be an array");
  const questions = Array.isArray(dossier.questions) ? dossier.questions : [];
  questions.forEach((question, index) => validateQuestion(question, index, provenanceIds, memoryIds, errors));
  questions.forEach((question, index) => {
    if (question.requester_participant_id !== dossier.owner_participant_id) errors.push(`$.questions[${index}].requester_participant_id must be the dossier owner`);
    if (question.purpose !== dossier.purpose_scope) errors.push(`$.questions[${index}].purpose must match purpose_scope`);
  });
  if (!Array.isArray(dossier.learning_proposals)) errors.push("$.learning_proposals must be an array");
  const proposalIds = new Set();
  const proposals = Array.isArray(dossier.learning_proposals) ? dossier.learning_proposals : [];
  proposals.forEach((proposal, index) => {
    validateLearningProposal(proposal, index, provenanceIds, errors);
    if (proposalIds.has(proposal.proposal_id)) errors.push(`$.learning_proposals[${index}].proposal_id must be unique`);
    if (proposal.purpose !== dossier.purpose_scope) errors.push(`$.learning_proposals[${index}].purpose must match purpose_scope`);
    proposalIds.add(proposal.proposal_id);
  });
  return errors;
}

function validateMutation(dossier, record) {
  const errors = validateDossier(dossier);
  validateTransitionRecord(record, errors);
  if (record?.actor_ref !== dossier?.owner_participant_id) errors.push("$transition.actor_ref must be the dossier owner");
  if (dossier?.provenance?.some((item) => item.record_id === record?.record_id)) errors.push("$transition.record_id must be unique");
  const previous = dossier?.provenance?.at(-1);
  if (previous && isDateTime(record?.recorded_at) && Date.parse(record.recorded_at) < Date.parse(previous.recorded_at)) {
    errors.push("$transition.recorded_at must not precede the latest provenance record");
  }
  if (dossier?.state !== "ACTIVE") errors.push(`dossier state ${dossier?.state} cannot be changed`);
  if (runtimeStates.get(dossier?.dossier_id) !== serializeState(dossier)) {
    errors.push("dossier snapshot is stale, altered, or not registered in this session");
  }
  return errors;
}

function appendRecord(candidate, record, event) {
  const previous = candidate.provenance.at(-1);
  candidate.provenance.push({ ...record, event, previous_record_id: previous.record_id });
}

function finishMutation(candidate) {
  const errors = validateDossier(candidate);
  if (errors.length > 0) return { ok: false, errors };
  runtimeStates.set(candidate.dossier_id, serializeState(candidate));
  return { ok: true, errors: [], dossier: candidate };
}

function activeConsent(dossier, scope, purpose, at) {
  const timestamp = Date.parse(at);
  return dossier.consents.some((consent) =>
    consent.state === "GRANTED"
    && consent.scope.includes(scope)
    && consent.purpose === purpose
    && timestamp >= Date.parse(consent.valid_from)
    && (consent.valid_until === null || timestamp <= Date.parse(consent.valid_until)));
}

// Local runtime cleanup only. Keep the opaque ID reserved to prevent replay,
// while replacing the serialized private snapshot with a content-free marker.
// Caller-held copies, browser memory reclamation and formal consent revocation
// are outside this operation; it produces no dossier or authority receipt.
export function disposeSessionDossier(dossier) {
  try {
    const errors = validateDossier(dossier);
    if (errors.length > 0) return { ok: false, errors };
    const current = runtimeStates.get(dossier.dossier_id);
    if (current === DISPOSED_STATE) return { ok: true, authority_effect: "NONE" };
    if (current !== serializeState(dossier)) {
      return { ok: false, errors: ["dossier snapshot is stale, altered, or not registered in this session"] };
    }
    runtimeStates.set(dossier.dossier_id, DISPOSED_STATE);
    return { ok: true, authority_effect: "NONE" };
  } catch {
    return { ok: false, errors: ["dossier must be a valid local session snapshot"] };
  }
}

export function createDossier(input) {
  const keys = ["dossier_id", "identity_id", "owner_participant_id", "purpose_scope", "created_at", "record_id", "source", "source_revision"];
  const errors = [];
  if (!checkKeys(input, keys, keys, "$create", errors)) return { ok: false, errors };
  const dossier = {
    dossier_id: input.dossier_id,
    identity_id: input.identity_id,
    owner_participant_id: input.owner_participant_id,
    purpose_scope: input.purpose_scope,
    visibility: {
      audience_participant_ids: [input.owner_participant_id],
      purpose: input.purpose_scope
    },
    created_at: input.created_at,
    storage_policy: "SESSION_ONLY",
    state: "ACTIVE",
    authority_effect: "NONE",
    consents: [],
    memories: [],
    questions: [],
    learning_proposals: [],
    provenance: [{
      record_id: input.record_id,
      recorded_at: input.created_at,
      event: "DOSSIER_CREATED",
      actor_ref: input.owner_participant_id,
      source: input.source,
      source_revision: input.source_revision,
      previous_record_id: null
    }]
  };
  errors.push(...validateDossier(dossier));
  if (runtimeStates.has(dossier.dossier_id)) errors.push("$create.dossier_id is already registered in this session");
  if (errors.length === 0) runtimeStates.set(dossier.dossier_id, serializeState(dossier));
  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [], dossier };
}

export function grantDossierConsent(dossier, consent, record) {
  const errors = validateMutation(dossier, record);
  if (errors.length > 0) return { ok: false, errors };
  const keys = ["consent_id", "scope", "purpose", "valid_from", "valid_until"];
  if (!checkKeys(consent, keys, keys, "$consent", errors)) return { ok: false, errors };
  validateConsent({ ...consent, state: "GRANTED" }, 0, errors);
  if (consent.purpose !== dossier.purpose_scope) errors.push("$consent.purpose must match dossier purpose_scope");
  if (dossier.consents.some((item) => item.consent_id === consent.consent_id)) errors.push("$consent.consent_id must be unique");
  if (errors.length > 0) return { ok: false, errors };
  const candidate = clone(dossier);
  candidate.consents.push({ ...clone(consent), state: "GRANTED" });
  appendRecord(candidate, record, `DOSSIER_CONSENT_GRANTED:${consent.consent_id}`);
  return finishMutation(candidate);
}

export function revokeDossierConsent(dossier, consentId, record) {
  const errors = validateMutation(dossier, record);
  if (errors.length > 0) return { ok: false, errors };
  const consentIndex = dossier.consents.findIndex((consent) => consent.consent_id === consentId);
  if (consentIndex < 0) errors.push(`consent ${consentId} was not found`);
  else if (dossier.consents[consentIndex].state !== "GRANTED") errors.push(`consent ${consentId} is not granted`);
  if (errors.length > 0) return { ok: false, errors };
  const candidate = clone(dossier);
  candidate.consents[consentIndex].state = "REVOKED";
  candidate.state = "PAUSED";
  appendRecord(candidate, record, `DOSSIER_CONSENT_REVOKED:${consentId}`);
  return finishMutation(candidate);
}

export function addMemory(dossier, memory, record) {
  const errors = validateMutation(dossier, record);
  if (errors.length > 0) return { ok: false, errors };
  const keys = ["memory_id", "content", "source_ref", "source_revision", "captured_at", "purpose", "sensitivity", "retention_until"];
  if (!checkKeys(memory, keys, keys, "$memory", errors)) return { ok: false, errors };
  if (memory.purpose !== dossier.purpose_scope) errors.push("$memory.purpose must match dossier purpose_scope");
  if (!activeConsent(dossier, "STORE_MEMORY", memory.purpose, record.recorded_at)) errors.push("matching active STORE_MEMORY consent is required");
  if (dossier.memories.some((item) => item.memory_id === memory.memory_id)) errors.push("$memory.memory_id must be unique");
  if (errors.length > 0) return { ok: false, errors };
  const candidate = clone(dossier);
  appendRecord(candidate, record, `MEMORY_ADDED:${memory.memory_id}`);
  candidate.memories.push({ ...clone(memory), state: "CURRENT", provenance_reference: record.record_id });
  return finishMutation(candidate);
}

function tokens(text) {
  return new Set((text.toLocaleLowerCase().match(WORD_PATTERN) ?? [])
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

export function answerQuestion(dossier, question, record) {
  const errors = validateMutation(dossier, record);
  if (errors.length > 0) return { ok: false, errors };
  const keys = ["question_id", "requester_participant_id", "purpose", "asked_at", "text"];
  if (!checkKeys(question, keys, keys, "$question", errors)) return { ok: false, errors };
  if (question.requester_participant_id !== dossier.owner_participant_id
    || !dossier.visibility.audience_participant_ids.includes(question.requester_participant_id)) {
    errors.push("$question.requester_participant_id is outside dossier visibility");
  }
  if (question.purpose !== dossier.purpose_scope) errors.push("$question.purpose must match dossier purpose_scope");
  if (!activeConsent(dossier, "QUERY_MEMORY", question.purpose, record.recorded_at)) errors.push("matching active QUERY_MEMORY consent is required");
  if (dossier.questions.some((item) => item.question_id === question.question_id)) errors.push("$question.question_id must be unique");
  if (!isString(question.text)) errors.push("$question.text is required");
  if (question.asked_at !== record.recorded_at) errors.push("$question.asked_at must equal the provenance time");
  if (errors.length > 0) return { ok: false, errors };

  const queryTokens = tokens(question.text);
  const matches = dossier.memories
    .filter((memory) => memory.state === "CURRENT"
      && memory.purpose === dossier.purpose_scope
      && memory.purpose === question.purpose
      && (memory.retention_until === null || Date.parse(memory.retention_until) >= Date.parse(question.asked_at)))
    .map((memory) => ({
      memory,
      score: [...queryTokens].filter((token) => tokens(`${memory.content} ${memory.purpose}`).has(token)).length
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.memory.memory_id.localeCompare(right.memory.memory_id))
    .slice(0, 3);

  const supported = matches.length > 0;
  const result = {
    ...clone(question),
    status: supported ? "ANSWER_SUPPORTED" : "INSUFFICIENT_EVIDENCE",
    answer: supported
      ? matches.map(({ memory }) => memory.content).join(" ")
      : "RIO heeft binnen dit dossier onvoldoende bewijs om deze vraag te beantwoorden.",
    citations: matches.map(({ memory }) => memory.memory_id),
    authority_effect: "NONE",
    provenance_reference: record.record_id
  };
  const candidate = clone(dossier);
  appendRecord(candidate, record, `QUESTION_ANSWERED:${question.question_id}:${result.status}`);
  candidate.questions.push(result);
  const finished = finishMutation(candidate);
  return finished.ok ? { ...finished, result } : finished;
}

export function proposeHistoricalLearning(dossier, proposal, record) {
  const errors = validateMutation(dossier, record);
  if (errors.length > 0) return { ok: false, errors };
  const keys = ["proposal_id", "content", "source_ref", "source_revision", "purpose"];
  if (!checkKeys(proposal, keys, keys, "$proposal", errors)) return { ok: false, errors };
  if (proposal.purpose !== dossier.purpose_scope) errors.push("$proposal.purpose must match dossier purpose_scope");
  if (!activeConsent(dossier, "PROPOSE_LEARNING", proposal.purpose, record.recorded_at)) errors.push("matching active PROPOSE_LEARNING consent is required");
  if (dossier.learning_proposals.some((item) => item.proposal_id === proposal.proposal_id)) errors.push("$proposal.proposal_id must be unique");
  for (const key of keys) if (!isString(proposal[key])) errors.push(`$proposal.${key} is required`);
  if (errors.length > 0) return { ok: false, errors };
  const candidate = clone(dossier);
  appendRecord(candidate, record, `LEARNING_PROPOSED:${proposal.proposal_id}`);
  candidate.learning_proposals.push({
    ...clone(proposal),
    state: "PENDING_REVIEW",
    authority_effect: "NONE",
    provenance_reference: record.record_id
  });
  return finishMutation(candidate);
}

export function reviewLearningProposal(dossier, proposalId, decision, record) {
  const errors = validateMutation(dossier, record);
  if (errors.length > 0) return { ok: false, errors };
  if (!["ACCEPTED", "REJECTED", "DISPUTED"].includes(decision)) errors.push("$review.decision is unknown");
  const proposalIndex = dossier.learning_proposals.findIndex((proposal) => proposal.proposal_id === proposalId);
  if (proposalIndex < 0) errors.push(`learning proposal ${proposalId} was not found`);
  else if (dossier.learning_proposals[proposalIndex].state !== "PENDING_REVIEW") errors.push(`learning proposal ${proposalId} is not pending review`);
  if (!activeConsent(dossier, "REVIEW_LEARNING", dossier.purpose_scope, record.recorded_at)) errors.push("matching active REVIEW_LEARNING consent is required");
  if (errors.length > 0) return { ok: false, errors };
  const candidate = clone(dossier);
  candidate.learning_proposals[proposalIndex].state = decision;
  appendRecord(candidate, record, `LEARNING_REVIEWED:${proposalId}:${decision}`);
  return finishMutation(candidate);
}

export function classifyRequestedAction(action) {
  const constitutional = new Set([
    "CHANGE_CANON", "GRANT_AUTHORITY", "LINK_EXTERNAL_IDENTITY",
    "ENABLE_PERSISTENT_STORAGE", "ENABLE_MODEL_TRAINING", "EXECUTE_CROSS_DOMAIN"
  ]);
  const communication = new Set(["ASK_QUESTION", "STORE_SESSION_MEMORY", "PROPOSE_LEARNING", "REVIEW_LEARNING"]);
  if (constitutional.has(action)) return { status: "TRIAS_REVIEW_REQUIRED", executable: false, authority_effect: "NONE" };
  if (communication.has(action)) return { status: "RIO_READY_WITH_CONDITIONS", executable: false, authority_effect: "NONE" };
  return { status: "RIO_CONFLICTED", executable: false, authority_effect: "NONE" };
}
