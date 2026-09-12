import assert from "node:assert/strict";
import { localeProfile, resolveLocale, translate } from "./localization.mjs";
import {
  advanceMessageDelivery,
  canAdvanceDelivery,
  canTransition,
  canTransitionVisitcardEncounter,
  createConversation,
  grantConsent,
  invalidateVisitcard,
  policy,
  revokeConsent,
  sendMessage,
  setConversationLocale,
  transitionConversation,
  transitionVisitcardEncounter,
  validateConversation
} from "./runtime.mjs";

const validConversation = {
  conversation_id: "rio:conversation:conformance-001",
  locale: {
    requested: "nl",
    resolved: "nl",
    fallback_used: false,
    direction: "ltr",
    name: "Nederlands"
  },
  participants: [{
    participant_id: "participant-1",
    identity_ref: "identity:participant-1",
    identity_type: "PERSON",
    trust_indicator: "VERIFIED",
    endpoints: [{ address: "rio:participant-1", surface: "WEB", status: "VALID" }]
  }],
  context: { kind: "DIRECT", surfaces: ["WEB"] },
  created_at: "2026-09-12T00:00:00Z",
  current_state: "ACTIVE",
  provenance: [{
    record_id: "prov-1",
    source: "conformance-fixture",
    source_revision: "1",
    recorded_at: "2026-09-12T00:00:00Z",
    event: "CONVERSATION_CREATED",
    actor_ref: "participant-1",
    previous_record_id: null
  }],
  permissions: {
    consent_state: "GRANTED",
    allowed_actions: ["REQUEST_CONNECTION", "SEND_MESSAGE"],
    visibility: {
      audience_participant_ids: ["participant-1"],
      purpose: "RIO conformance",
      shared_with_participant_ids: [],
      retention_until: null
    },
    valid_from: "2026-09-12T00:00:00Z",
    valid_until: null,
    revoked_at: null,
    authority_effect: "NONE"
  },
  message_history: [{
    message_id: "message-1",
    sender_participant_id: "participant-1",
    created_at: "2026-09-12T00:00:01Z",
    delivery_state: "ACKNOWLEDGED",
    payload_reference: "payload:message-1"
  }]
};

const clone = () => structuredClone(validConversation);
const cases = [];
const expectValid = (name, value) => cases.push({ name, expected: true, errors: validateConversation(value) });
const expectInvalid = (name, value) => cases.push({ name, expected: false, errors: validateConversation(value) });

expectValid("canonical active conversation", clone());

const missingProvenance = clone();
missingProvenance.provenance = [];
expectInvalid("missing provenance", missingProvenance);

const unknownProperty = clone();
unknownProperty.unrecognized = true;
expectInvalid("unknown property", unknownProperty);

const unknownEnum = clone();
unknownEnum.current_state = "AUTHORIZED";
expectInvalid("unknown enum", unknownEnum);

const historicallyConnectedRevokedVisitcard = clone();
historicallyConnectedRevokedVisitcard.context.visitcard = {
  object_reference: "identity:participant-1",
  introduction: "Conformance card",
  rio_address: "rio:participant-1",
  provenance_reference: "prov-1",
  validity: "REVOKED",
  discovery_method: "QR",
  encounter_state: "CONNECTED"
};
expectValid("historically connected revoked VisitCard", historicallyConnectedRevokedVisitcard);

const deniedConsent = clone();
deniedConsent.permissions.consent_state = "DENIED";
expectInvalid("denied consent", deniedConsent);

const invalidEndpoint = clone();
invalidEndpoint.participants[0].endpoints[0].status = "INVALID";
expectInvalid("invalid endpoint", invalidEndpoint);

const identityConflict = clone();
identityConflict.participants.push(structuredClone(identityConflict.participants[0]));
expectInvalid("identity conflict", identityConflict);

const authorityClaim = clone();
authorityClaim.permissions.authority_effect = "GRANTED";
expectInvalid("authority claim", authorityClaim);

for (const testCase of cases) {
  assert.equal(testCase.expected, testCase.errors.length === 0, `${testCase.name}: ${testCase.errors.join("; ")}`);
}

const creationInput = {
  conversation_id: "rio:conversation:created-001",
  participants: [{
    participant_id: "participant-creator",
    identity_ref: "identity:participant-creator",
    identity_type: "PERSON",
    trust_indicator: "UNKNOWN",
    endpoints: [{ address: "rio:participant-creator", surface: "WEB", status: "UNKNOWN" }]
  }],
  context: { kind: "DIRECT", surfaces: ["WEB"] },
  created_at: "2026-09-12T00:00:00Z",
  record_id: "prov-created-1",
  source: "conformance-fixture",
  source_revision: "1",
  actor_ref: "participant-creator",
  visibility: {
    audience_participant_ids: ["participant-creator"],
    purpose: "RIO creation conformance",
    shared_with_participant_ids: [],
    retention_until: null
  }
};
const creationInputSnapshot = structuredClone(creationInput);
const createdConversation = createConversation(creationInput);
assert.equal(createdConversation.ok, true, "valid conversation creation must pass");
assert.deepEqual(creationInput, creationInputSnapshot, "creation input must remain immutable");
assert.equal(createdConversation.conversation.current_state, "DISCOVERED", "new conversation must start discovered");
assert.equal(createdConversation.conversation.permissions.consent_state, "NOT_REQUESTED", "creation must not imply consent");
assert.deepEqual(createdConversation.conversation.permissions.allowed_actions, [], "creation must not grant actions");
assert.equal(createdConversation.conversation.permissions.authority_effect, "NONE", "creation must not grant authority");
assert.equal(createdConversation.conversation.provenance[0].event, "CONVERSATION_CREATED", "creation must record provenance");
assert.equal(createdConversation.conversation.provenance[0].previous_record_id, null, "initial provenance must have no predecessor");
assert.deepEqual(createdConversation.conversation.message_history, [], "new conversation must contain no messages");
assert.deepEqual(createdConversation.conversation.locale, resolveLocale(), "creation must default to Dutch locale");

const arabicCreation = createConversation({
  ...creationInput,
  conversation_id: "rio:conversation:created-ar",
  record_id: "prov-created-ar-1",
  locale: "ar-SA"
});
assert.equal(arabicCreation.ok, true, "Arabic regional locale must be accepted");
assert.equal(arabicCreation.conversation.locale.resolved, "ar", "Arabic regional locale must normalize to ar");
assert.equal(arabicCreation.conversation.locale.direction, "rtl", "Arabic must use RTL direction");

const fallbackCreation = createConversation({
  ...creationInput,
  conversation_id: "rio:conversation:created-fallback",
  record_id: "prov-created-fallback-1",
  locale: "ja-JP"
});
assert.equal(fallbackCreation.ok, true, "unsupported locale must use safe fallback");
assert.equal(fallbackCreation.conversation.locale.resolved, "en", "unsupported locale must fall back to English");
assert.equal(fallbackCreation.conversation.locale.fallback_used, true, "locale fallback must remain visible");

const missingCreationSource = structuredClone(creationInput);
delete missingCreationSource.source;
assert.equal(createConversation(missingCreationSource).ok, false, "creation without source must fail closed");
const unknownCreationField = { ...creationInput, authorization: "GRANTED" };
assert.equal(createConversation(unknownCreationField).ok, false, "unknown creation field must fail closed");
const unknownCreationActor = { ...creationInput, actor_ref: "participant-missing" };
assert.equal(createConversation(unknownCreationActor).ok, false, "unknown creation actor must fail closed");

const consentGrant = {
  allowed_actions: ["REQUEST_CONNECTION", "SEND_MESSAGE"],
  visibility: structuredClone(creationInput.visibility),
  valid_from: "2026-09-12T00:00:30Z",
  valid_until: "2026-09-13T00:00:30Z"
};
const consentRecord = {
  record_id: "prov-consent-2",
  source: "conformance-fixture",
  source_revision: "1",
  recorded_at: "2026-09-12T00:00:30Z",
  actor_ref: "participant-creator"
};
const verifiedCreationInput = structuredClone(creationInput);
verifiedCreationInput.conversation_id = "rio:conversation:consent-001";
verifiedCreationInput.participants[0].trust_indicator = "VERIFIED";
verifiedCreationInput.participants[0].endpoints[0].status = "VALID";
verifiedCreationInput.record_id = "prov-consent-1";
const verifiedCreatedConversation = createConversation(verifiedCreationInput);
assert.equal(verifiedCreatedConversation.ok, true, "verified conversation creation must pass");
const grantedConsent = grantConsent(verifiedCreatedConversation.conversation, consentGrant, consentRecord);
assert.equal(grantedConsent.ok, true, "valid consent grant must pass");
assert.equal(verifiedCreatedConversation.conversation.permissions.consent_state, "NOT_REQUESTED", "consent source must remain immutable");
assert.equal(grantedConsent.conversation.permissions.consent_state, "GRANTED", "consent must be granted explicitly");
assert.deepEqual(grantedConsent.conversation.permissions.allowed_actions, consentGrant.allowed_actions, "granted actions must be explicit");
assert.equal(grantedConsent.conversation.permissions.authority_effect, "NONE", "consent must not create authority");
assert.equal(grantedConsent.conversation.provenance[1].event, "CONSENT_GRANTED", "consent grant must record provenance");
assert.equal(grantedConsent.conversation.provenance[1].previous_record_id, "prov-consent-1", "consent provenance must link backward");

const requestedAfterGrant = transitionConversation(grantedConsent.conversation, "REQUESTED", {
  ...consentRecord,
  record_id: "prov-requested-3",
  recorded_at: "2026-09-12T00:01:00Z"
});
const connectedAfterGrant = transitionConversation(requestedAfterGrant.conversation, "CONNECTED", {
  ...consentRecord,
  record_id: "prov-connected-4",
  recorded_at: "2026-09-12T00:01:30Z"
});
const activeAfterGrant = transitionConversation(connectedAfterGrant.conversation, "ACTIVE", {
  ...consentRecord,
  record_id: "prov-active-5",
  recorded_at: "2026-09-12T00:02:00Z"
});
assert.equal(activeAfterGrant.ok, true, "granted conversation must reach ACTIVE through valid transitions");

const revokedConsent = revokeConsent(activeAfterGrant.conversation, "2026-09-12T00:03:00Z", {
  ...consentRecord,
  record_id: "prov-revoked-6",
  recorded_at: "2026-09-12T00:03:00Z"
});
assert.equal(revokedConsent.ok, true, "valid consent revocation must pass");
assert.equal(activeAfterGrant.conversation.current_state, "ACTIVE", "revocation source must remain immutable");
assert.equal(revokedConsent.conversation.current_state, "PAUSED", "revocation must pause active communication");
assert.equal(revokedConsent.conversation.permissions.consent_state, "REVOKED", "revocation state must be explicit");
assert.deepEqual(revokedConsent.conversation.permissions.allowed_actions, [], "revocation must remove allowed actions");
assert.equal(revokedConsent.conversation.permissions.authority_effect, "NONE", "revocation must not affect authority");
assert.equal(revokedConsent.conversation.message_history.length, activeAfterGrant.conversation.message_history.length, "revocation must retain message history");
assert.equal(revokedConsent.conversation.provenance.length, activeAfterGrant.conversation.provenance.length + 1, "revocation must retain and append provenance");
assert.match(revokedConsent.conversation.provenance.at(-1).event, /^CONSENT_REVOKED:/, "revocation event must be traceable");

const reversedValidity = { ...consentGrant, valid_from: "2026-09-14T00:00:00Z", valid_until: "2026-09-13T00:00:00Z" };
assert.equal(grantConsent(createdConversation.conversation, reversedValidity, consentRecord).ok, false, "reversed validity must fail closed");
const unknownVisibility = structuredClone(consentGrant);
unknownVisibility.visibility.audience_participant_ids = ["participant-missing"];
assert.equal(grantConsent(createdConversation.conversation, unknownVisibility, consentRecord).ok, false, "unknown visibility participant must fail closed");
assert.equal(grantConsent(createdConversation.conversation, { ...consentGrant, authorization: "GRANTED" }, consentRecord).ok, false, "unknown grant field must fail closed");
const missingActions = structuredClone(consentGrant);
delete missingActions.allowed_actions;
assert.equal(grantConsent(createdConversation.conversation, missingActions, consentRecord).ok, false, "missing allowed actions must fail closed");
assert.equal(revokeConsent(activeAfterGrant.conversation, "not-a-date", { ...consentRecord, record_id: "prov-invalid-revoke" }).ok, false, "invalid revoke timestamp must fail closed");

assert.deepEqual(localeProfile.supported_locales, ["nl", "en", "de", "fr", "es", "ar", "zh"], "exactly seven provisional locales must be configured");
assert.equal(resolveLocale("de-DE").resolved, "de", "regional German must normalize to de");
assert.equal(resolveLocale("zh-CN").resolved, "zh", "regional Chinese must normalize to zh");
assert.equal(resolveLocale("ar-SA").direction, "rtl", "Arabic locale must expose RTL direction");
assert.equal(resolveLocale("ja-JP").resolved, "en", "unsupported locale must resolve to English fallback");
for (const locale of localeProfile.supported_locales) {
  const translation = translate("RIO_READY", locale);
  assert.equal(translation.ok, true, `RIO_READY must exist for ${locale}`);
  assert.ok(translation.text.length > 0, `RIO_READY translation must be non-empty for ${locale}`);
}
assert.equal(translate("RIO_UNKNOWN_STATUS", "nl").ok, false, "unknown message ID must fail closed");

const localeRecord = {
  record_id: "prov-locale-2",
  source: "conformance-fixture",
  source_revision: "1",
  recorded_at: "2026-09-12T00:01:00Z",
  actor_ref: "participant-1"
};
const localeSource = clone();
const localeSourceSnapshot = structuredClone(localeSource);
const arabicLocale = setConversationLocale(localeSource, "ar-SA", localeRecord);
assert.equal(arabicLocale.ok, true, "valid locale change must pass");
assert.deepEqual(localeSource, localeSourceSnapshot, "locale source must remain immutable");
assert.equal(arabicLocale.conversation.locale.resolved, "ar", "regional Arabic must normalize to ar");
assert.equal(arabicLocale.conversation.locale.direction, "rtl", "changed Arabic locale must use RTL direction");
assert.equal(arabicLocale.conversation.current_state, localeSource.current_state, "locale change must retain conversation state");
assert.deepEqual(arabicLocale.conversation.permissions, localeSource.permissions, "locale change must retain consent and permissions");
assert.deepEqual(arabicLocale.conversation.participants, localeSource.participants, "locale change must retain participants");
assert.deepEqual(arabicLocale.conversation.context, localeSource.context, "locale change must retain context");
assert.deepEqual(arabicLocale.conversation.message_history, localeSource.message_history, "locale change must retain message history");
assert.equal(arabicLocale.conversation.permissions.authority_effect, "NONE", "locale change must not create authority");
assert.equal(arabicLocale.conversation.provenance.length, localeSource.provenance.length + 1, "locale change must append provenance");
assert.equal(arabicLocale.conversation.provenance.at(-1).event, "CONVERSATION_LOCALE_CHANGED:nl->ar", "locale event must record resolved languages");
assert.equal(arabicLocale.conversation.provenance.at(-1).previous_record_id, "prov-1", "locale provenance must link backward");

const fallbackLocale = setConversationLocale(arabicLocale.conversation, "ja-JP", {
  ...localeRecord,
  record_id: "prov-locale-3",
  recorded_at: "2026-09-12T00:02:00Z"
});
assert.equal(fallbackLocale.ok, true, "unsupported locale change must use safe fallback");
assert.equal(fallbackLocale.conversation.locale.resolved, "en", "unsupported locale change must fall back to English");
assert.equal(fallbackLocale.conversation.locale.fallback_used, true, "locale-change fallback must remain visible");

const unchangedLocale = setConversationLocale(fallbackLocale.conversation, "ja-JP", {
  ...localeRecord,
  record_id: "prov-locale-4"
});
assert.equal(unchangedLocale.ok, false, "unchanged requested locale must not create an event");
assert.equal("conversation" in unchangedLocale, false, "failed unchanged locale must return no candidate");
const duplicateLocaleRecord = setConversationLocale(fallbackLocale.conversation, "fr-FR", {
  ...localeRecord,
  record_id: "prov-locale-2"
});
assert.equal(duplicateLocaleRecord.ok, false, "duplicate locale provenance ID must fail closed");
assert.equal("conversation" in duplicateLocaleRecord, false, "failed duplicate locale record must return no candidate");
const unknownLocaleActor = setConversationLocale(fallbackLocale.conversation, "de-DE", {
  ...localeRecord,
  record_id: "prov-locale-4",
  actor_ref: "participant-missing"
});
assert.equal(unknownLocaleActor.ok, false, "unknown locale actor must fail closed");
assert.equal("conversation" in unknownLocaleActor, false, "failed unknown locale actor must return no candidate");
const invalidLocaleSource = clone();
invalidLocaleSource.permissions.authority_effect = "GRANTED";
const invalidLocaleChange = setConversationLocale(invalidLocaleSource, "fr-FR", localeRecord);
assert.equal(invalidLocaleChange.ok, false, "invalid locale source must fail closed");
assert.equal("conversation" in invalidLocaleChange, false, "failed invalid source must return no candidate");

assert.equal(canTransitionVisitcardEncounter("ENCOUNTERED", "INTRODUCED"), true, "expected legal VisitCard transition");
assert.equal(canTransitionVisitcardEncounter("RECOGNIZED", "ACCEPTED"), true, "VisitCard acceptance must follow recognition");
assert.equal(canTransitionVisitcardEncounter("ENCOUNTERED", "RECOGNIZED"), false, "skipped VisitCard transition must fail");
assert.equal(canTransitionVisitcardEncounter("CONNECTED", "ACCEPTED"), false, "transition from connected VisitCard must fail");

const visitcardSource = clone();
visitcardSource.context.visitcard = {
  object_reference: "identity:participant-1",
  introduction: "Hallo! Dit is de kaart van deelnemer één.",
  rio_address: "rio:participant-1",
  provenance_reference: "prov-1",
  validity: "VALID",
  discovery_method: "QR",
  encounter_state: "ENCOUNTERED"
};
const visitcardSourceSnapshot = structuredClone(visitcardSource);
const visitcardRecord = {
  record_id: "prov-visitcard-2",
  source: "conformance-fixture",
  source_revision: "1",
  recorded_at: "2026-09-12T00:01:00Z",
  actor_ref: "participant-1"
};
const introducedVisitcard = transitionVisitcardEncounter(visitcardSource, "INTRODUCED", visitcardRecord);
assert.equal(introducedVisitcard.ok, true, "valid VisitCard introduction must pass");
assert.deepEqual(visitcardSource, visitcardSourceSnapshot, "VisitCard source must remain immutable");
assert.equal(introducedVisitcard.conversation.context.visitcard.encounter_state, "INTRODUCED", "VisitCard target state must be applied");
assert.equal(introducedVisitcard.conversation.current_state, visitcardSource.current_state, "VisitCard transition must retain conversation state");
assert.deepEqual(introducedVisitcard.conversation.permissions, visitcardSource.permissions, "VisitCard transition must retain consent and permissions");
assert.deepEqual(introducedVisitcard.conversation.message_history, visitcardSource.message_history, "VisitCard transition must retain messages");
assert.equal(introducedVisitcard.conversation.permissions.authority_effect, "NONE", "VisitCard transition must not create authority");
assert.equal(introducedVisitcard.conversation.provenance.at(-1).event, "VISITCARD_ENCOUNTER_STATE_CHANGED:ENCOUNTERED->INTRODUCED", "VisitCard event must be traceable");
assert.equal(introducedVisitcard.conversation.provenance.at(-1).previous_record_id, "prov-1", "VisitCard provenance must link backward");
const recognizedVisitcard = transitionVisitcardEncounter(introducedVisitcard.conversation, "RECOGNIZED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-3",
  recorded_at: "2026-09-12T00:02:00Z"
});
assert.equal(recognizedVisitcard.ok, true, "valid VisitCard recognition must pass");
const acceptedVisitcard = transitionVisitcardEncounter(recognizedVisitcard.conversation, "ACCEPTED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-4",
  recorded_at: "2026-09-12T00:03:00Z"
});
assert.equal(acceptedVisitcard.ok, true, "valid consent-bound VisitCard acceptance must pass");
const connectedVisitcard = transitionVisitcardEncounter(acceptedVisitcard.conversation, "CONNECTED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-5",
  recorded_at: "2026-09-12T00:04:00Z"
});
assert.equal(connectedVisitcard.ok, true, "valid VisitCard connection must pass");
assert.equal(connectedVisitcard.conversation.context.visitcard.encounter_state, "CONNECTED", "VisitCard lifecycle must reach connected");
assert.equal(connectedVisitcard.conversation.provenance.length, visitcardSource.provenance.length + 4, "VisitCard lifecycle must retain and append provenance");
assert.deepEqual(connectedVisitcard.conversation.provenance.slice(-4).map((record) => record.previous_record_id), ["prov-1", "prov-visitcard-2", "prov-visitcard-3", "prov-visitcard-4"], "VisitCard provenance chain must remain linked");
assert.deepEqual(connectedVisitcard.conversation.provenance.slice(-4).map((record) => record.event), [
  "VISITCARD_ENCOUNTER_STATE_CHANGED:ENCOUNTERED->INTRODUCED",
  "VISITCARD_ENCOUNTER_STATE_CHANGED:INTRODUCED->RECOGNIZED",
  "VISITCARD_ENCOUNTER_STATE_CHANGED:RECOGNIZED->ACCEPTED",
  "VISITCARD_ENCOUNTER_STATE_CHANGED:ACCEPTED->CONNECTED"
], "VisitCard lifecycle events must be complete");

const connectedVisitcardSnapshot = structuredClone(connectedVisitcard.conversation);
const revokedConnectedVisitcard = invalidateVisitcard(connectedVisitcard.conversation, "REVOKED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-6",
  recorded_at: "2026-09-12T00:05:00Z"
});
assert.equal(revokedConnectedVisitcard.ok, true, "valid VisitCard revocation must pass");
assert.deepEqual(connectedVisitcard.conversation, connectedVisitcardSnapshot, "VisitCard revocation source must remain immutable");
assert.equal(revokedConnectedVisitcard.conversation.context.visitcard.validity, "REVOKED", "VisitCard validity must become revoked");
assert.equal(revokedConnectedVisitcard.conversation.context.visitcard.encounter_state, "CONNECTED", "VisitCard revocation must retain encounter history");
assert.equal(revokedConnectedVisitcard.conversation.current_state, "PAUSED", "VisitCard revocation must pause active communication");
assert.deepEqual(revokedConnectedVisitcard.conversation.permissions, connectedVisitcard.conversation.permissions, "VisitCard revocation must retain consent and permissions");
assert.deepEqual(revokedConnectedVisitcard.conversation.message_history, connectedVisitcard.conversation.message_history, "VisitCard revocation must retain messages");
assert.equal(revokedConnectedVisitcard.conversation.permissions.authority_effect, "NONE", "VisitCard revocation must not affect authority");
assert.equal(revokedConnectedVisitcard.conversation.provenance.length, connectedVisitcard.conversation.provenance.length + 1, "VisitCard revocation must append provenance");
assert.equal(revokedConnectedVisitcard.conversation.provenance.at(-1).event, "VISITCARD_INVALIDATED:VALID->REVOKED", "VisitCard revocation event must be traceable");
assert.equal(revokedConnectedVisitcard.conversation.provenance.at(-1).previous_record_id, "prov-visitcard-5", "VisitCard revocation provenance must link backward");

const expiredVisitcard = invalidateVisitcard(recognizedVisitcard.conversation, "EXPIRED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-expired",
  recorded_at: "2026-09-12T00:05:00Z"
});
assert.equal(expiredVisitcard.ok, true, "valid VisitCard expiration must pass");
assert.equal(expiredVisitcard.conversation.context.visitcard.validity, "EXPIRED", "VisitCard validity must become expired");
assert.equal(expiredVisitcard.conversation.context.visitcard.encounter_state, "RECOGNIZED", "VisitCard expiration must retain encounter history");
assert.equal(expiredVisitcard.conversation.current_state, "PAUSED", "VisitCard expiration must pause active communication");
const transitionAfterExpiration = transitionVisitcardEncounter(expiredVisitcard.conversation, "ACCEPTED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-after-expiry"
});
assert.equal(transitionAfterExpiration.ok, false, "expired VisitCard must not advance");
assert.equal("conversation" in transitionAfterExpiration, false, "failed expired VisitCard transition must return no candidate");

const repeatedInvalidation = invalidateVisitcard(revokedConnectedVisitcard.conversation, "REVOKED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-repeat"
});
assert.equal(repeatedInvalidation.ok, false, "repeated VisitCard invalidation must not create an event");
assert.equal("conversation" in repeatedInvalidation, false, "failed repeated invalidation must return no candidate");
const changedInvalidation = invalidateVisitcard(revokedConnectedVisitcard.conversation, "EXPIRED", {
  ...visitcardRecord,
  record_id: "prov-visitcard-change"
});
assert.equal(changedInvalidation.ok, false, "revoked VisitCard must not change to expired");
assert.equal("conversation" in changedInvalidation, false, "failed invalidation change must return no candidate");
const unsupportedInvalidation = invalidateVisitcard(visitcardSource, "UNKNOWN", visitcardRecord);
assert.equal(unsupportedInvalidation.ok, false, "unsupported VisitCard invalidation target must fail closed");
assert.equal("conversation" in unsupportedInvalidation, false, "failed unsupported invalidation must return no candidate");
const missingInvalidationCard = invalidateVisitcard(clone(), "REVOKED", visitcardRecord);
assert.equal(missingInvalidationCard.ok, false, "VisitCard invalidation without a card must fail closed");
assert.equal("conversation" in missingInvalidationCard, false, "failed missing invalidation card must return no candidate");
const duplicateInvalidationRecord = invalidateVisitcard(visitcardSource, "REVOKED", { ...visitcardRecord, record_id: "prov-1" });
assert.equal(duplicateInvalidationRecord.ok, false, "duplicate invalidation provenance ID must fail closed");
assert.equal("conversation" in duplicateInvalidationRecord, false, "failed duplicate invalidation record must return no candidate");
const unknownInvalidationActor = invalidateVisitcard(visitcardSource, "REVOKED", { ...visitcardRecord, actor_ref: "participant-missing" });
assert.equal(unknownInvalidationActor.ok, false, "unknown invalidation actor must fail closed");
assert.equal("conversation" in unknownInvalidationActor, false, "failed invalidation actor must return no candidate");
const invalidInvalidationSource = structuredClone(visitcardSource);
invalidInvalidationSource.permissions.authority_effect = "GRANTED";
const invalidSourceInvalidation = invalidateVisitcard(invalidInvalidationSource, "REVOKED", visitcardRecord);
assert.equal(invalidSourceInvalidation.ok, false, "invalid VisitCard invalidation source must fail closed");
assert.equal("conversation" in invalidSourceInvalidation, false, "failed invalidation source must return no candidate");

const missingVisitcard = transitionVisitcardEncounter(clone(), "INTRODUCED", visitcardRecord);
assert.equal(missingVisitcard.ok, false, "conversation without VisitCard must fail closed");
assert.equal("conversation" in missingVisitcard, false, "failed missing VisitCard must return no candidate");
const skippedVisitcard = transitionVisitcardEncounter(visitcardSource, "RECOGNIZED", visitcardRecord);
assert.equal(skippedVisitcard.ok, false, "skipped VisitCard state must fail closed");
assert.equal("conversation" in skippedVisitcard, false, "failed skipped VisitCard must return no candidate");
const revokedVisitcardSource = structuredClone(recognizedVisitcard.conversation);
revokedVisitcardSource.context.visitcard.validity = "REVOKED";
const revokedVisitcardTransition = transitionVisitcardEncounter(revokedVisitcardSource, "ACCEPTED", { ...visitcardRecord, record_id: "prov-visitcard-revoked" });
assert.equal(revokedVisitcardTransition.ok, false, "revoked VisitCard must not be accepted");
assert.equal("conversation" in revokedVisitcardTransition, false, "failed revoked VisitCard must return no candidate");
const noConsentVisitcardSource = structuredClone(recognizedVisitcard.conversation);
noConsentVisitcardSource.current_state = "PAUSED";
noConsentVisitcardSource.permissions.consent_state = "NOT_REQUESTED";
noConsentVisitcardSource.permissions.allowed_actions = [];
noConsentVisitcardSource.permissions.valid_from = null;
const noConsentVisitcard = transitionVisitcardEncounter(noConsentVisitcardSource, "ACCEPTED", { ...visitcardRecord, record_id: "prov-visitcard-no-consent" });
assert.equal(noConsentVisitcard.ok, false, "VisitCard acceptance without consent must fail closed");
assert.equal("conversation" in noConsentVisitcard, false, "failed VisitCard consent must return no candidate");
const noPermissionVisitcardSource = structuredClone(recognizedVisitcard.conversation);
noPermissionVisitcardSource.permissions.allowed_actions = ["SEND_MESSAGE"];
const noPermissionVisitcard = transitionVisitcardEncounter(noPermissionVisitcardSource, "ACCEPTED", { ...visitcardRecord, record_id: "prov-visitcard-no-permission" });
assert.equal(noPermissionVisitcard.ok, false, "VisitCard acceptance without REQUEST_CONNECTION must fail closed");
assert.equal("conversation" in noPermissionVisitcard, false, "failed VisitCard permission must return no candidate");
const prematureConnectionSource = structuredClone(acceptedVisitcard.conversation);
prematureConnectionSource.current_state = "PAUSED";
const prematureVisitcardConnection = transitionVisitcardEncounter(prematureConnectionSource, "CONNECTED", { ...visitcardRecord, record_id: "prov-visitcard-premature" });
assert.equal(prematureVisitcardConnection.ok, false, "VisitCard must not connect before its conversation");
assert.equal("conversation" in prematureVisitcardConnection, false, "failed premature VisitCard connection must return no candidate");
const duplicateVisitcardRecord = transitionVisitcardEncounter(visitcardSource, "INTRODUCED", { ...visitcardRecord, record_id: "prov-1" });
assert.equal(duplicateVisitcardRecord.ok, false, "duplicate VisitCard provenance ID must fail closed");
assert.equal("conversation" in duplicateVisitcardRecord, false, "failed duplicate VisitCard record must return no candidate");
const unknownVisitcardActor = transitionVisitcardEncounter(visitcardSource, "INTRODUCED", { ...visitcardRecord, actor_ref: "participant-missing" });
assert.equal(unknownVisitcardActor.ok, false, "unknown VisitCard actor must fail closed");
assert.equal("conversation" in unknownVisitcardActor, false, "failed unknown VisitCard actor must return no candidate");
const invalidVisitcardSource = structuredClone(visitcardSource);
invalidVisitcardSource.permissions.authority_effect = "GRANTED";
const invalidVisitcardTransition = transitionVisitcardEncounter(invalidVisitcardSource, "INTRODUCED", visitcardRecord);
assert.equal(invalidVisitcardTransition.ok, false, "invalid VisitCard source must fail closed");
assert.equal("conversation" in invalidVisitcardTransition, false, "failed invalid VisitCard source must return no candidate");

const messageInput = {
  message_id: "message-2",
  sender_participant_id: "participant-1",
  created_at: "2026-09-12T00:03:00Z",
  payload_reference: "payload:message-2"
};
const messageRecord = {
  record_id: "prov-message-2",
  source: "conformance-fixture",
  source_revision: "1",
  recorded_at: "2026-09-12T00:03:00Z",
  actor_ref: "participant-1"
};
const messageSource = clone();
const messageSourceSnapshot = structuredClone(messageSource);
const sentMessage = sendMessage(messageSource, messageInput, messageRecord);
assert.equal(sentMessage.ok, true, "valid message creation must pass");
assert.deepEqual(messageSource, messageSourceSnapshot, "message source must remain immutable");
assert.equal(sentMessage.conversation.current_state, messageSource.current_state, "message creation must retain conversation state");
assert.deepEqual(sentMessage.conversation.locale, messageSource.locale, "message creation must retain locale");
assert.deepEqual(sentMessage.conversation.participants, messageSource.participants, "message creation must retain participants");
assert.deepEqual(sentMessage.conversation.context, messageSource.context, "message creation must retain context");
assert.deepEqual(sentMessage.conversation.permissions, messageSource.permissions, "message creation must retain consent and permissions");
assert.equal(sentMessage.conversation.permissions.authority_effect, "NONE", "message creation must not create authority");
assert.equal(sentMessage.conversation.message_history.length, messageSource.message_history.length + 1, "message creation must append one message");
assert.deepEqual(sentMessage.conversation.message_history.at(-1), { ...messageInput, delivery_state: "CREATED" }, "runtime must create the initial delivery state");
assert.equal(sentMessage.conversation.provenance.length, messageSource.provenance.length + 1, "message creation must append provenance");
assert.equal(sentMessage.conversation.provenance.at(-1).event, "MESSAGE_CREATED:message-2", "message creation event must be traceable");
assert.equal(sentMessage.conversation.provenance.at(-1).previous_record_id, "prov-1", "message provenance must link backward");

const pausedMessageSource = clone();
pausedMessageSource.current_state = "PAUSED";
const pausedMessage = sendMessage(pausedMessageSource, messageInput, messageRecord);
assert.equal(pausedMessage.ok, false, "paused conversation must not send messages");
assert.equal("conversation" in pausedMessage, false, "failed paused message must return no candidate");
const unpermittedMessageSource = clone();
unpermittedMessageSource.permissions.allowed_actions = ["REQUEST_CONNECTION"];
const unpermittedMessage = sendMessage(unpermittedMessageSource, messageInput, messageRecord);
assert.equal(unpermittedMessage.ok, false, "missing SEND_MESSAGE permission must fail closed");
assert.equal("conversation" in unpermittedMessage, false, "failed unpermitted message must return no candidate");
const expiredMessageSource = clone();
expiredMessageSource.permissions.valid_until = "2026-09-12T00:02:00Z";
const expiredMessage = sendMessage(expiredMessageSource, messageInput, messageRecord);
assert.equal(expiredMessage.ok, false, "message outside consent validity must fail closed");
assert.equal("conversation" in expiredMessage, false, "failed expired message must return no candidate");
const unknownSenderMessage = sendMessage(messageSource, { ...messageInput, sender_participant_id: "participant-missing" }, messageRecord);
assert.equal(unknownSenderMessage.ok, false, "unknown message sender must fail closed");
assert.equal("conversation" in unknownSenderMessage, false, "failed unknown sender must return no candidate");
const duplicateMessage = sendMessage(messageSource, { ...messageInput, message_id: "message-1" }, messageRecord);
assert.equal(duplicateMessage.ok, false, "duplicate message ID must fail closed");
assert.equal("conversation" in duplicateMessage, false, "failed duplicate message must return no candidate");
const duplicateMessageRecord = sendMessage(messageSource, messageInput, { ...messageRecord, record_id: "prov-1" });
assert.equal(duplicateMessageRecord.ok, false, "duplicate message provenance ID must fail closed");
assert.equal("conversation" in duplicateMessageRecord, false, "failed duplicate message record must return no candidate");
const unknownMessageField = sendMessage(messageSource, { ...messageInput, authority: "GRANTED" }, messageRecord);
assert.equal(unknownMessageField.ok, false, "unknown message field must fail closed");
assert.equal("conversation" in unknownMessageField, false, "failed unknown message field must return no candidate");
const multiParticipantMessageSource = clone();
multiParticipantMessageSource.participants.push({
  participant_id: "participant-2",
  identity_ref: "identity:participant-2",
  identity_type: "PERSON",
  trust_indicator: "VERIFIED",
  endpoints: [{ address: "rio:participant-2", surface: "WEB", status: "VALID" }]
});
const mismatchedActorMessage = sendMessage(multiParticipantMessageSource, messageInput, { ...messageRecord, actor_ref: "participant-2" });
assert.equal(mismatchedActorMessage.ok, false, "message actor must match sender");
assert.equal("conversation" in mismatchedActorMessage, false, "failed actor mismatch must return no candidate");
const invalidMessageSource = clone();
invalidMessageSource.permissions.authority_effect = "GRANTED";
const invalidSourceMessage = sendMessage(invalidMessageSource, messageInput, messageRecord);
assert.equal(invalidSourceMessage.ok, false, "invalid message source must fail closed");
assert.equal("conversation" in invalidSourceMessage, false, "failed invalid message source must return no candidate");

assert.equal(canTransition("REQUESTED", "CONNECTED"), true, "expected legal conversation transition");
assert.equal(canTransition("CLOSED", "ACTIVE"), false, "transition from CLOSED must fail");
assert.equal(canTransition("ACTIVE", "CONNECTED"), false, "backward conversation transition must fail");
assert.equal(canAdvanceDelivery("CREATED", "DELIVERED"), true, "forward delivery transition must pass");
assert.equal(canAdvanceDelivery("READ", "DELIVERED"), false, "backward delivery transition must fail");
assert.equal(policy.constitutional_authority_created, false, "implementation profile must not create authority");

const transitionRecord = {
  record_id: "prov-2",
  source: "conformance-fixture",
  source_revision: "1",
  recorded_at: "2026-09-12T00:01:00Z",
  actor_ref: "participant-1"
};
const requestedConversation = clone();
requestedConversation.current_state = "REQUESTED";
const successfulTransition = transitionConversation(requestedConversation, "CONNECTED", transitionRecord);
assert.equal(successfulTransition.ok, true, "valid transition must pass");
assert.equal(requestedConversation.current_state, "REQUESTED", "source conversation must remain immutable");
assert.equal(successfulTransition.conversation.current_state, "CONNECTED", "target state must be applied");
assert.equal(successfulTransition.conversation.provenance.length, 2, "transition must append provenance");
assert.equal(successfulTransition.conversation.provenance[1].previous_record_id, "prov-1", "transition provenance must link backward");

const closedConversation = clone();
closedConversation.current_state = "CLOSED";
assert.equal(transitionConversation(closedConversation, "ACTIVE", transitionRecord).ok, false, "transition from CLOSED must fail closed");

const deniedTransition = clone();
deniedTransition.current_state = "REQUESTED";
deniedTransition.permissions.consent_state = "DENIED";
assert.equal(transitionConversation(deniedTransition, "CONNECTED", transitionRecord).ok, false, "transition without consent must fail closed");

const deliveryRecord = {
  record_id: "prov-delivery-2",
  source: "conformance-fixture",
  source_revision: "1",
  recorded_at: "2026-09-12T00:02:00Z",
  actor_ref: "participant-1"
};
const createdMessageConversation = clone();
createdMessageConversation.message_history[0].delivery_state = "CREATED";
const successfulDelivery = advanceMessageDelivery(createdMessageConversation, "message-1", "DELIVERED", deliveryRecord);
assert.equal(successfulDelivery.ok, true, "valid delivery transition must pass");
assert.equal(createdMessageConversation.message_history[0].delivery_state, "CREATED", "delivery source must remain immutable");
assert.equal(successfulDelivery.conversation.message_history[0].delivery_state, "DELIVERED", "target delivery state must be applied");
assert.equal(successfulDelivery.conversation.provenance[1].previous_record_id, "prov-1", "delivery provenance must link backward");
assert.match(successfulDelivery.conversation.provenance[1].event, /^MESSAGE_DELIVERY_STATE_CHANGED:/, "delivery event must be traceable");
assert.equal(advanceMessageDelivery(successfulDelivery.conversation, "message-1", "CREATED", { ...deliveryRecord, record_id: "prov-delivery-3" }).ok, false, "backward delivery must fail closed");
assert.equal(advanceMessageDelivery(createdMessageConversation, "message-1", "CREATED", deliveryRecord).ok, false, "unchanged delivery state must not create an event");
assert.equal(advanceMessageDelivery(createdMessageConversation, "missing-message", "DELIVERED", deliveryRecord).ok, false, "unknown message must fail closed");
assert.equal(advanceMessageDelivery(createdMessageConversation, "message-1", "DELIVERED", { ...deliveryRecord, record_id: "prov-1" }).ok, false, "duplicate provenance ID must fail closed");

console.log(`RIO conformance PASS: ${cases.length} conversation fixtures, 20 creation assertions, 23 consent assertions, 19 localization assertions, 26 locale-mutation assertions, 4 VisitCard-policy assertions, 34 VisitCard-transition assertions, 34 VisitCard-invalidation assertions, 31 message-creation assertions, 6 policy assertions, 7 conversation-transition assertions, and 9 delivery-transition assertions`);