import { readFileSync } from "node:fs";
import { resolveLocale } from "./localization.mjs";

const loadJson = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
export const schema = loadJson("./conversation.schema.json");
export const policy = loadJson("./transition-policy.json");

const conversationStates = new Set(schema.$defs.conversationState.enum);
const deliveryStates = new Set(schema.$defs.message.properties.delivery_state.enum);
const trustIndicators = new Set(schema.$defs.participant.properties.trust_indicator.enum);
const identityTypes = new Set(schema.$defs.participant.properties.identity_type.enum);
const surfaces = new Set(schema.$defs.endpoint.properties.surface.enum);
const endpointStatuses = new Set(schema.$defs.endpoint.properties.status.enum);
const contextKinds = new Set(schema.$defs.context.properties.kind.enum);
const consentStates = new Set(schema.$defs.permissions.properties.consent_state.enum);
const allowedActions = new Set(schema.$defs.permissions.properties.allowed_actions.items.enum);
const visitcardValidity = new Set(schema.$defs.visitcard.properties.validity.enum);
const discoveryMethods = new Set(schema.$defs.visitcard.properties.discovery_method.enum);
const encounterStates = new Set(schema.$defs.visitcard.properties.encounter_state.enum);
const subjectTypes = new Set(schema.$defs.subject.properties.type.enum);
const subjectStates = new Set(schema.$defs.subject.properties.state.enum);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const isDateTimeOrNull = (value) => value === null || (isNonEmptyString(value) && !Number.isNaN(Date.parse(value)));

function requireKeys(value, required, allowed, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  for (const key of required) {
    if (!(key in value)) errors.push(`${path}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key} is unknown`);
  }
  return true;
}

function requireEnum(value, values, path, errors) {
  if (!values.has(value)) errors.push(`${path} has an unknown value`);
}

export function validateConversation(conversation) {
  const errors = [];
  const rootKeys = schema.required;
  if (!requireKeys(conversation, rootKeys, rootKeys, "$", errors)) return errors;

  if (!/^rio:conversation:[A-Za-z0-9._~-]+$/.test(conversation.conversation_id ?? "")) {
    errors.push("$.conversation_id is invalid");
  }
  if (!isDateTimeOrNull(conversation.created_at) || conversation.created_at === null) {
    errors.push("$.created_at must be a date-time");
  }
  requireEnum(conversation.current_state, conversationStates, "$.current_state", errors);

  const localeKeys = ["requested", "resolved", "fallback_used", "direction", "name"];
  if (requireKeys(conversation.locale, localeKeys, localeKeys, "$.locale", errors)) {
    const expectedLocale = resolveLocale(conversation.locale.requested ?? undefined);
    if (conversation.locale.resolved !== expectedLocale.resolved) errors.push("$.locale.resolved does not match requested locale");
    if (conversation.locale.fallback_used !== expectedLocale.fallback_used) errors.push("$.locale.fallback_used does not match requested locale");
    if (conversation.locale.direction !== expectedLocale.direction) errors.push("$.locale.direction does not match resolved locale");
    if (conversation.locale.name !== expectedLocale.name) errors.push("$.locale.name does not match resolved locale");
  }

  const participantIds = new Set();
  if (!Array.isArray(conversation.participants) || conversation.participants.length === 0) {
    errors.push("$.participants must contain at least one participant");
  } else {
    conversation.participants.forEach((participant, index) => {
      const path = `$.participants[${index}]`;
      const keys = ["participant_id", "identity_ref", "identity_type", "trust_indicator", "endpoints"];
      if (!requireKeys(participant, keys, keys, path, errors)) return;
      if (!isNonEmptyString(participant.participant_id)) errors.push(`${path}.participant_id is required`);
      if (participantIds.has(participant.participant_id)) errors.push(`${path}.participant_id conflicts with another participant`);
      participantIds.add(participant.participant_id);
      if (!isNonEmptyString(participant.identity_ref)) errors.push(`${path}.identity_ref is required`);
      requireEnum(participant.identity_type, identityTypes, `${path}.identity_type`, errors);
      requireEnum(participant.trust_indicator, trustIndicators, `${path}.trust_indicator`, errors);
      if (!Array.isArray(participant.endpoints) || participant.endpoints.length === 0) {
        errors.push(`${path}.endpoints must contain at least one endpoint`);
      } else {
        participant.endpoints.forEach((endpoint, endpointIndex) => {
          const endpointPath = `${path}.endpoints[${endpointIndex}]`;
          const endpointKeys = ["address", "surface", "status"];
          if (!requireKeys(endpoint, endpointKeys, endpointKeys, endpointPath, errors)) return;
          if (!isNonEmptyString(endpoint.address)) errors.push(`${endpointPath}.address is required`);
          requireEnum(endpoint.surface, surfaces, `${endpointPath}.surface`, errors);
          requireEnum(endpoint.status, endpointStatuses, `${endpointPath}.status`, errors);
        });
      }
    });
  }

  const subjectProvenanceReferences = [];
  const contextKeys = ["kind", "surfaces", "parent_conversation_id", "visitcard", "subjects"];
  if (requireKeys(conversation.context, ["kind", "surfaces"], contextKeys, "$.context", errors)) {
    requireEnum(conversation.context.kind, contextKinds, "$.context.kind", errors);
    if (!Array.isArray(conversation.context.surfaces) || conversation.context.surfaces.length === 0) {
      errors.push("$.context.surfaces must contain at least one surface");
    } else {
      conversation.context.surfaces.forEach((surface, index) => requireEnum(surface, surfaces, `$.context.surfaces[${index}]`, errors));
    }
    if (conversation.context.visitcard !== undefined) validateVisitcard(conversation.context.visitcard, errors);
    if (conversation.context.subjects !== undefined) {
      if (!Array.isArray(conversation.context.subjects)) {
        errors.push("$.context.subjects must be an array");
      } else {
        const subjectIds = new Set();
        conversation.context.subjects.forEach((subject, index) => {
          validateSubject(subject, index, subjectIds, subjectProvenanceReferences, errors);
        });
      }
    }
  }

  const provenanceIds = new Set();
  if (!Array.isArray(conversation.provenance) || conversation.provenance.length === 0) {
    errors.push("$.provenance must contain at least one record");
  } else {
    conversation.provenance.forEach((record, index) => {
      const path = `$.provenance[${index}]`;
      const keys = ["record_id", "source", "source_revision", "recorded_at", "event", "actor_ref", "previous_record_id"];
      if (!requireKeys(record, keys, keys, path, errors)) return;
      const previousRecord = index > 0 && isObject(conversation.provenance[index - 1]) ? conversation.provenance[index - 1] : null;
      for (const key of ["record_id", "source", "source_revision", "event", "actor_ref"]) {
        if (!isNonEmptyString(record[key])) errors.push(`${path}.${key} is required`);
      }
      if (!isDateTimeOrNull(record.recorded_at) || record.recorded_at === null) errors.push(`${path}.recorded_at must be a date-time`);
      if (!participantIds.has(record.actor_ref)) errors.push(`${path}.actor_ref must reference a participant`);
      if (index === 0 && record.previous_record_id !== null) errors.push(`${path}.previous_record_id must be null for the first record`);
      if (index > 0 && record.previous_record_id !== previousRecord?.record_id) errors.push(`${path}.previous_record_id must reference the immediately previous record`);
      if (index > 0 && isDateTimeOrNull(record.recorded_at) && isDateTimeOrNull(previousRecord?.recorded_at)
        && Date.parse(record.recorded_at) < Date.parse(previousRecord.recorded_at)) {
        errors.push(`${path}.recorded_at must not precede the previous record`);
      }
      if (provenanceIds.has(record.record_id)) errors.push(`${path}.record_id must be unique`);
      provenanceIds.add(record.record_id);
    });
  }
  const visitcardProvenanceReference = conversation.context?.visitcard?.provenance_reference;
  if (visitcardProvenanceReference !== undefined && !provenanceIds.has(visitcardProvenanceReference)) {
    errors.push("$.context.visitcard.provenance_reference must reference a provenance record");
  }
  subjectProvenanceReferences.forEach(({ path, reference }) => {
    if (!provenanceIds.has(reference)) errors.push(`${path}.provenance_reference must reference a provenance record`);
  });

  validatePermissions(conversation.permissions, participantIds, errors);

  const messageIds = new Set();
  if (!Array.isArray(conversation.message_history)) {
    errors.push("$.message_history must be an array");
  } else {
    conversation.message_history.forEach((message, index) => {
      const path = `$.message_history[${index}]`;
      const keys = ["message_id", "sender_participant_id", "created_at", "delivery_state", "payload_reference"];
      if (!requireKeys(message, keys, keys, path, errors)) return;
      if (!isNonEmptyString(message.message_id) || messageIds.has(message.message_id)) errors.push(`${path}.message_id must be non-empty and unique`);
      messageIds.add(message.message_id);
      if (!participantIds.has(message.sender_participant_id)) errors.push(`${path}.sender_participant_id must reference a participant`);
      if (!isDateTimeOrNull(message.created_at) || message.created_at === null) errors.push(`${path}.created_at must be a date-time`);
      requireEnum(message.delivery_state, deliveryStates, `${path}.delivery_state`, errors);
      if (!isNonEmptyString(message.payload_reference)) errors.push(`${path}.payload_reference is required`);
    });
  }

  if (["CONNECTED", "ACTIVE", "RESUMED"].includes(conversation.current_state)) {
    if (conversation.permissions?.consent_state !== "GRANTED") errors.push("connected state requires granted consent");
    for (const participant of conversation.participants ?? []) {
      if (participant.trust_indicator !== "VERIFIED") errors.push("connected state requires verified participants");
      if (!(participant.endpoints ?? []).some((endpoint) => endpoint.status === "VALID")) errors.push("connected state requires a valid endpoint per participant");
    }
  }

  if (["BRIDGE", "HANDOFF"].includes(conversation.context?.kind)) {
    const requiredAction = conversation.context.kind;
    if (!conversation.permissions?.allowed_actions?.includes(requiredAction)) errors.push(`${requiredAction} context requires matching permission`);
  }

  return errors;
}

function validatePermissions(permissions, participantIds, errors) {
  const keys = ["consent_state", "allowed_actions", "visibility", "valid_from", "valid_until", "revoked_at", "authority_effect"];
  if (!requireKeys(permissions, keys, keys, "$.permissions", errors)) return;
  requireEnum(permissions.consent_state, consentStates, "$.permissions.consent_state", errors);
  if (!Array.isArray(permissions.allowed_actions)) {
    errors.push("$.permissions.allowed_actions must be an array");
  } else {
    permissions.allowed_actions.forEach((action, index) => requireEnum(action, allowedActions, `$.permissions.allowed_actions[${index}]`, errors));
  }
  if (permissions.authority_effect !== "NONE") errors.push("$.permissions.authority_effect must be NONE");
  for (const key of ["valid_from", "valid_until", "revoked_at"]) {
    if (!isDateTimeOrNull(permissions[key])) errors.push(`$.permissions.${key} must be null or a date-time`);
  }
  if (permissions.consent_state === "REVOKED" && permissions.revoked_at === null) {
    errors.push("revoked consent requires revoked_at");
  }
  if (permissions.consent_state === "GRANTED" && permissions.valid_from === null) {
    errors.push("granted consent requires valid_from");
  }
  if (permissions.consent_state !== "GRANTED" && Array.isArray(permissions.allowed_actions) && permissions.allowed_actions.length > 0) {
    errors.push("allowed actions require granted consent");
  }
  if (permissions.valid_from !== null && permissions.valid_until !== null && Date.parse(permissions.valid_from) > Date.parse(permissions.valid_until)) {
    errors.push("permission validity window is reversed");
  }
  const visibilityKeys = ["audience_participant_ids", "purpose", "shared_with_participant_ids", "retention_until"];
  if (requireKeys(permissions.visibility, visibilityKeys, visibilityKeys, "$.permissions.visibility", errors)) {
    if (!Array.isArray(permissions.visibility.audience_participant_ids)) errors.push("$.permissions.visibility.audience_participant_ids must be an array");
    if (!Array.isArray(permissions.visibility.shared_with_participant_ids)) errors.push("$.permissions.visibility.shared_with_participant_ids must be an array");
    if (!isNonEmptyString(permissions.visibility.purpose)) errors.push("$.permissions.visibility.purpose is required");
    if (!isDateTimeOrNull(permissions.visibility.retention_until)) errors.push("$.permissions.visibility.retention_until must be null or a date-time");
    for (const key of ["audience_participant_ids", "shared_with_participant_ids"]) {
      const participantIdsToCheck = Array.isArray(permissions.visibility[key]) ? permissions.visibility[key] : [];
      for (const participantId of participantIdsToCheck) {
        if (!participantIds.has(participantId)) errors.push(`$.permissions.visibility.${key} must reference participants`);
      }
    }
  }
}

function validateVisitcard(visitcard, errors) {
  const keys = ["object_reference", "introduction", "rio_address", "provenance_reference", "validity", "discovery_method", "encounter_state"];
  if (!requireKeys(visitcard, keys, keys, "$.context.visitcard", errors)) return;
  for (const key of ["object_reference", "introduction", "rio_address", "provenance_reference"]) {
    if (!isNonEmptyString(visitcard[key])) errors.push(`$.context.visitcard.${key} is required`);
  }
  requireEnum(visitcard.validity, visitcardValidity, "$.context.visitcard.validity", errors);
  requireEnum(visitcard.discovery_method, discoveryMethods, "$.context.visitcard.discovery_method", errors);
  requireEnum(visitcard.encounter_state, encounterStates, "$.context.visitcard.encounter_state", errors);
}

function validateSubject(subject, index, subjectIds, provenanceReferences, errors) {
  const path = `$.context.subjects[${index}]`;
  const requiredKeys = ["subject_id", "type", "name", "preview_reference", "meaning", "provenance_reference", "state", "boundary", "next_action", "presentation_effect"];
  const allowedKeys = [...requiredKeys, "object_reference"];
  if (!requireKeys(subject, requiredKeys, allowedKeys, path, errors)) return;
  if (!/^rio:subject:[A-Za-z0-9._~-]+$/.test(subject.subject_id ?? "")) errors.push(`${path}.subject_id is invalid`);
  if (subjectIds.has(subject.subject_id)) errors.push(`${path}.subject_id must be unique`);
  subjectIds.add(subject.subject_id);
  requireEnum(subject.type, subjectTypes, `${path}.type`, errors);
  requireEnum(subject.state, subjectStates, `${path}.state`, errors);
  for (const key of ["name", "preview_reference", "meaning", "provenance_reference", "boundary", "next_action"]) {
    if (!isNonEmptyString(subject[key])) errors.push(`${path}.${key} is required`);
  }
  if (subject.object_reference !== undefined && !isNonEmptyString(subject.object_reference)) errors.push(`${path}.object_reference must be a non-empty string`);
  if (subject.type === "ELIXER" && !isNonEmptyString(subject.object_reference)) errors.push(`${path}.object_reference is required for ELIXER`);
  if (subject.presentation_effect !== "NONE") errors.push(`${path}.presentation_effect must be NONE`);
  if (isNonEmptyString(subject.provenance_reference)) provenanceReferences.push({ path, reference: subject.provenance_reference });
}

export function canTransition(from, to) {
  return policy.conversation_transitions[from]?.includes(to) ?? false;
}

export function canAdvanceDelivery(from, to) {
  const fromIndex = policy.delivery_order.indexOf(from);
  const toIndex = policy.delivery_order.indexOf(to);
  return fromIndex >= 0 && toIndex >= fromIndex;
}

export function canTransitionVisitcardEncounter(from, to) {
  return policy.visitcard_encounter_transitions[from]?.includes(to) ?? false;
}

function validateTransitionRecord(conversation, record) {
  const recordKeys = ["record_id", "source", "source_revision", "recorded_at", "actor_ref"];
  const errors = [];
  if (!requireKeys(record, recordKeys, recordKeys, "$transition", errors)) return errors;
  for (const key of ["record_id", "source", "source_revision", "actor_ref"]) {
    if (!isNonEmptyString(record[key])) errors.push(`$transition.${key} is required`);
  }
  if (!isDateTimeOrNull(record.recorded_at) || record.recorded_at === null) {
    errors.push("$transition.recorded_at must be a date-time");
  }
  if (!conversation.participants.some((participant) => participant.participant_id === record.actor_ref)) {
    errors.push("$transition.actor_ref must reference a participant");
  }
  if (conversation.provenance.some((item) => item.record_id === record.record_id)) {
    errors.push("$transition.record_id must be unique");
  }
  const previousRecord = conversation.provenance.at(-1);
  if (isDateTimeOrNull(record.recorded_at) && record.recorded_at !== null && previousRecord !== undefined
    && Date.parse(record.recorded_at) < Date.parse(previousRecord.recorded_at)) {
    errors.push("$transition.recorded_at must not precede the latest provenance record");
  }
  return errors;
}

function isConsentValidAt(conversation, recordedAt) {
  const permissions = conversation.permissions;
  if (permissions.consent_state !== "GRANTED") return false;
  const timestamp = Date.parse(recordedAt);
  if (permissions.valid_from !== null && timestamp < Date.parse(permissions.valid_from)) return false;
  if (permissions.valid_until !== null && timestamp > Date.parse(permissions.valid_until)) return false;
  return true;
}

export function createConversation(input) {
  const requiredInputKeys = [
    "conversation_id",
    "participants",
    "context",
    "created_at",
    "record_id",
    "source",
    "source_revision",
    "actor_ref",
    "visibility"
  ];
  const inputKeys = [...requiredInputKeys, "locale"];
  const inputErrors = [];
  if (!requireKeys(input, requiredInputKeys, inputKeys, "$create", inputErrors)) {
    return { ok: false, errors: inputErrors };
  }
  if (inputErrors.length > 0) {
    return { ok: false, errors: inputErrors };
  }

  const conversation = {
    conversation_id: input.conversation_id,
    locale: resolveLocale(input.locale),
    participants: structuredClone(input.participants),
    context: structuredClone(input.context),
    created_at: input.created_at,
    current_state: "DISCOVERED",
    provenance: [{
      record_id: input.record_id,
      source: input.source,
      source_revision: input.source_revision,
      recorded_at: input.created_at,
      event: "CONVERSATION_CREATED",
      actor_ref: input.actor_ref,
      previous_record_id: null
    }],
    permissions: {
      consent_state: "NOT_REQUESTED",
      allowed_actions: [],
      visibility: structuredClone(input.visibility),
      valid_from: null,
      valid_until: null,
      revoked_at: null,
      authority_effect: "NONE"
    },
    message_history: []
  };

  const errors = validateConversation(conversation);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, errors: [], conversation };
}

export function grantConsent(conversation, grant, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  const grantKeys = ["allowed_actions", "visibility", "valid_from", "valid_until"];
  const grantErrors = [];
  if (!requireKeys(grant, grantKeys, grantKeys, "$grant", grantErrors)) {
    return { ok: false, errors: grantErrors };
  }
  if (grantErrors.length > 0) {
    return { ok: false, errors: grantErrors };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.permissions = {
    consent_state: "GRANTED",
    allowed_actions: structuredClone(grant.allowed_actions),
    visibility: structuredClone(grant.visibility),
    valid_from: grant.valid_from,
    valid_until: grant.valid_until,
    revoked_at: null,
    authority_effect: "NONE"
  };
  candidate.provenance.push({
    ...record,
    event: "CONSENT_GRANTED",
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }
  return { ok: true, errors: [], conversation: candidate };
}

export function revokeConsent(conversation, revokedAt, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }
  if (!isDateTimeOrNull(revokedAt) || revokedAt === null) {
    return { ok: false, errors: ["$revoke.revoked_at must be a date-time"] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  const priorConsentState = candidate.permissions.consent_state;
  candidate.permissions.consent_state = "REVOKED";
  candidate.permissions.allowed_actions = [];
  candidate.permissions.valid_until = revokedAt;
  candidate.permissions.revoked_at = revokedAt;
  candidate.permissions.authority_effect = "NONE";
  if (["CONNECTED", "ACTIVE", "RESUMED"].includes(candidate.current_state)) {
    candidate.current_state = "PAUSED";
  }
  candidate.provenance.push({
    ...record,
    event: `CONSENT_REVOKED:${priorConsentState}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }
  return { ok: true, errors: [], conversation: candidate };
}

export function expireConsent(conversation, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }
  if (conversation.permissions.consent_state !== "GRANTED") {
    return { ok: false, errors: ["only granted consent can expire"] };
  }
  if (conversation.permissions.valid_until === null) {
    return { ok: false, errors: ["consent without valid_until cannot expire"] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }
  if (Date.parse(record.recorded_at) < Date.parse(conversation.permissions.valid_until)) {
    return { ok: false, errors: ["consent cannot expire before valid_until"] };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.permissions.consent_state = "EXPIRED";
  candidate.permissions.allowed_actions = [];
  candidate.permissions.revoked_at = null;
  candidate.permissions.authority_effect = "NONE";
  if (["CONNECTED", "ACTIVE", "RESUMED"].includes(candidate.current_state)) {
    candidate.current_state = "PAUSED";
  }
  candidate.provenance.push({
    ...record,
    event: `CONSENT_EXPIRED:${candidate.permissions.valid_until}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}

export function setConversationLocale(conversation, requestedLocale, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  const locale = resolveLocale(requestedLocale);
  if (locale.requested === conversation.locale.requested) {
    return { ok: false, errors: [`locale ${locale.requested ?? locale.resolved} is already active`] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  const previousLocale = candidate.locale.resolved;
  candidate.locale = locale;
  candidate.provenance.push({
    ...record,
    event: `CONVERSATION_LOCALE_CHANGED:${previousLocale}->${locale.resolved}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}

export function transitionVisitcardEncounter(conversation, to, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  const visitcard = conversation.context.visitcard;
  if (visitcard === undefined) {
    return { ok: false, errors: ["conversation has no VisitCard"] };
  }
  const from = visitcard.encounter_state;
  if (visitcard.validity !== "VALID") {
    return { ok: false, errors: [`VisitCard validity ${visitcard.validity} cannot advance`] };
  }
  if (!canTransitionVisitcardEncounter(from, to)) {
    return { ok: false, errors: [`VisitCard encounter transition ${from} -> ${to} is not allowed`] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  if (["ACCEPTED", "CONNECTED"].includes(to)) {
    if (conversation.permissions.consent_state !== "GRANTED" || !conversation.permissions.allowed_actions.includes("REQUEST_CONNECTION")) {
      return { ok: false, errors: [`VisitCard transition to ${to} requires granted REQUEST_CONNECTION permission`] };
    }
    if (!isConsentValidAt(conversation, record.recorded_at)) {
      return { ok: false, errors: [`VisitCard transition to ${to} is outside the consent validity window`] };
    }
  }
  if (to === "CONNECTED" && !["CONNECTED", "ACTIVE", "RESUMED"].includes(conversation.current_state)) {
    return { ok: false, errors: ["VisitCard cannot become CONNECTED before the conversation is connected"] };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.context.visitcard.encounter_state = to;
  candidate.provenance.push({
    ...record,
    event: `VISITCARD_ENCOUNTER_STATE_CHANGED:${from}->${to}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}

export function invalidateVisitcard(conversation, validity, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  const visitcard = conversation.context.visitcard;
  if (visitcard === undefined) {
    return { ok: false, errors: ["conversation has no VisitCard"] };
  }
  if (!["REVOKED", "EXPIRED"].includes(validity)) {
    return { ok: false, errors: ["VisitCard invalidation must be REVOKED or EXPIRED"] };
  }
  if (visitcard.validity === validity) {
    return { ok: false, errors: [`VisitCard validity ${validity} is already active`] };
  }
  if (visitcard.validity !== "VALID") {
    return { ok: false, errors: [`VisitCard validity ${visitcard.validity} cannot change to ${validity}`] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.context.visitcard.validity = validity;
  if (["CONNECTED", "ACTIVE", "RESUMED"].includes(candidate.current_state)) {
    candidate.current_state = "PAUSED";
  }
  candidate.provenance.push({
    ...record,
    event: `VISITCARD_INVALIDATED:VALID->${validity}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}

export function transitionConversation(conversation, to, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  if (!canTransition(conversation.current_state, to)) {
    return { ok: false, errors: [`transition ${conversation.current_state} -> ${to} is not allowed`] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }
  if (["CONNECTED", "ACTIVE", "RESUMED"].includes(to) && !isConsentValidAt(conversation, record.recorded_at)) {
    return { ok: false, errors: [`transition to ${to} is outside the consent validity window`] };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.current_state = to;
  candidate.provenance.push({
    ...record,
    event: `CONVERSATION_STATE_CHANGED:${conversation.current_state}->${to}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}

export function sendMessage(conversation, message, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  const messageKeys = ["message_id", "sender_participant_id", "created_at", "payload_reference"];
  const messageErrors = [];
  if (!requireKeys(message, messageKeys, messageKeys, "$message", messageErrors)) {
    return { ok: false, errors: messageErrors };
  }
  for (const key of ["message_id", "sender_participant_id", "payload_reference"]) {
    if (!isNonEmptyString(message[key])) messageErrors.push(`$message.${key} is required`);
  }
  if (!isDateTimeOrNull(message.created_at) || message.created_at === null) {
    messageErrors.push("$message.created_at must be a date-time");
  }
  if (messageErrors.length > 0) {
    return { ok: false, errors: messageErrors };
  }

  if (!["CONNECTED", "ACTIVE", "RESUMED"].includes(conversation.current_state)) {
    return { ok: false, errors: [`conversation state ${conversation.current_state} cannot send messages`] };
  }
  if (conversation.permissions.consent_state !== "GRANTED" || !conversation.permissions.allowed_actions.includes("SEND_MESSAGE")) {
    return { ok: false, errors: ["sending a message requires granted SEND_MESSAGE permission"] };
  }
  const messageTime = Date.parse(message.created_at);
  const validFrom = Date.parse(conversation.permissions.valid_from);
  const validUntil = conversation.permissions.valid_until === null ? null : Date.parse(conversation.permissions.valid_until);
  if (messageTime < validFrom || (validUntil !== null && messageTime > validUntil)) {
    return { ok: false, errors: ["message timestamp is outside the consent validity window"] };
  }
  if (!conversation.participants.some((participant) => participant.participant_id === message.sender_participant_id)) {
    return { ok: false, errors: ["$message.sender_participant_id must reference a participant"] };
  }
  if (conversation.message_history.some((item) => item.message_id === message.message_id)) {
    return { ok: false, errors: ["$message.message_id must be unique"] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }
  if (record.actor_ref !== message.sender_participant_id) {
    return { ok: false, errors: ["$transition.actor_ref must match the message sender"] };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.message_history.push({ ...message, delivery_state: "CREATED" });
  candidate.provenance.push({
    ...record,
    event: `MESSAGE_CREATED:${message.message_id}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}

export function advanceMessageDelivery(conversation, messageId, to, record) {
  const sourceErrors = validateConversation(conversation);
  if (sourceErrors.length > 0) {
    return { ok: false, errors: sourceErrors };
  }

  const messageIndex = conversation.message_history.findIndex((message) => message.message_id === messageId);
  if (messageIndex < 0) {
    return { ok: false, errors: [`message ${messageId} was not found`] };
  }

  const from = conversation.message_history[messageIndex].delivery_state;
  if (from === to || !canAdvanceDelivery(from, to)) {
    return { ok: false, errors: [`delivery transition ${from} -> ${to} is not allowed`] };
  }

  const recordErrors = validateTransitionRecord(conversation, record);
  if (recordErrors.length > 0) {
    return { ok: false, errors: recordErrors };
  }

  const candidate = structuredClone(conversation);
  const previousRecord = candidate.provenance.at(-1);
  candidate.message_history[messageIndex].delivery_state = to;
  candidate.provenance.push({
    ...record,
    event: `MESSAGE_DELIVERY_STATE_CHANGED:${messageId}:${from}->${to}`,
    previous_record_id: previousRecord.record_id
  });

  const targetErrors = validateConversation(candidate);
  if (targetErrors.length > 0) {
    return { ok: false, errors: targetErrors };
  }

  return { ok: true, errors: [], conversation: candidate };
}
