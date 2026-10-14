import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { authorize, verifyWithPublicKey } from "../src/pvb/pvb015.mjs";

const INVALID = "INVALID_AUTHORIZATION_REQUEST";
const VERIFICATION_REQUIRED = "VISITCARD_VERIFICATION_REQUIRED";
const MANDATE_REQUIRED = "MANDATE_REQUIRED";
const UNAVAILABLE = "MANDATE_VERIFICATION_UNAVAILABLE";

function expectDenied(request, reason) {
  const result = authorize(request);
  assert.deepEqual(result, { authorized: false, reason });
  assert.equal(Object.isFrozen(result), true, "the decision must be immutable");
  assert.deepEqual(Object.keys(result).sort(), ["authorized", "reason"]);
  return result;
}

describe("authorization request boundaries", () => {
  const invalidRequests = [
    ["undefined", undefined],
    ["null", null],
    ["false", false],
    ["true", true],
    ["zero", 0],
    ["number", 1],
    ["string", "request"],
    ["symbol", Symbol("request")],
    ["bigint", 1n],
    ["array", []],
    ["function", () => ({ verifiedVisitCard: true, mandate: {} })],
    ["date", new Date("2026-10-14T00:00:00Z")],
    ["map", new Map()],
    ["boxed boolean", new Boolean(true)],
    ["class instance", new (class Request { verifiedVisitCard = true; mandate = {}; })()],
    ["custom prototype", Object.create({ verifiedVisitCard: true, mandate: {} })]
  ];
  for (const [label, request] of invalidRequests) {
    it("denies " + label + " as a request", () => expectDenied(request, INVALID));
  }

  it("denies a call without parameters without throwing", () => {
    assert.deepEqual(authorize(), { authorized: false, reason: INVALID });
  });

  it("denies a proxy whose prototype cannot be inspected", () => {
    const request = new Proxy({}, {
      getPrototypeOf() { throw new Error("untrusted reflection"); }
    });
    expectDenied(request, INVALID);
  });

  it("denies a proxy whose own descriptors cannot be inspected", () => {
    const request = new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error("untrusted reflection"); }
    });
    expectDenied(request, INVALID);
  });

  it("denies a revoked request proxy", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expectDenied(proxy, INVALID);
  });
});

describe("VisitCard verification is an explicit own data value", () => {
  it("requires the verification property", () => {
    expectDenied({ mandate: {} }, VERIFICATION_REQUIRED);
  });

  const nonTrueVerification = [
    ["undefined", undefined],
    ["null", null],
    ["false", false],
    ["zero", 0],
    ["one", 1],
    ["true text", "true"],
    ["false text", "false"],
    ["object", {}],
    ["array", []],
    ["boxed boolean", new Boolean(true)],
    ["symbol", Symbol("verified")],
    ["bigint", 1n],
    ["function", () => true]
  ];
  for (const [label, verifiedVisitCard] of nonTrueVerification) {
    it("does not promote " + label + " to verification", () => {
      expectDenied({ verifiedVisitCard, mandate: {} }, VERIFICATION_REQUIRED);
    });
  }

  it("does not invoke a verification getter", () => {
    let calls = 0;
    const request = {
      get verifiedVisitCard() { calls += 1; throw new Error("getter must not run"); },
      mandate: {}
    };
    expectDenied(request, VERIFICATION_REQUIRED);
    assert.equal(calls, 0);
  });

  it("does not treat a setter-only verification property as verified", () => {
    let calls = 0;
    const request = Object.defineProperty({ mandate: {} }, "verifiedVisitCard", {
      set() { calls += 1; }
    });
    expectDenied(request, VERIFICATION_REQUIRED);
    assert.equal(calls, 0);
  });
});

describe("an absent mandate remains closed", () => {
  it("requires a mandate when the property is absent", () => {
    expectDenied({ verifiedVisitCard: true }, MANDATE_REQUIRED);
  });
  it("requires a mandate when its value is undefined", () => {
    expectDenied({ verifiedVisitCard: true, mandate: undefined }, MANDATE_REQUIRED);
  });
  it("preserves the existing null-mandate result", () => {
    expectDenied({ verifiedVisitCard: true, mandate: null }, MANDATE_REQUIRED);
  });
  it("applies the same rule to a null-prototype request", () => {
    expectDenied(Object.assign(Object.create(null), { verifiedVisitCard: true }), MANDATE_REQUIRED);
  });
});

describe("mandate presence and self-described status do not grant authority", () => {
  const { proxy: revokedMandate, revoke } = Proxy.revocable({}, {});
  revoke();
  const unsupportedMandates = [
    ["false", false],
    ["zero", 0],
    ["empty string", ""],
    ["NaN", NaN],
    ["zero bigint", 0n],
    ["true", true],
    ["one", 1],
    ["unsigned text", "test-mandate"],
    ["array", []],
    ["empty object", {}],
    ["null-prototype object", Object.create(null)],
    ["date", new Date("2026-10-14T00:00:00Z")],
    ["boxed boolean", new Boolean(true)],
    ["symbol", Symbol("mandate")],
    ["function", () => true],
    ["throwing payload proxy", new Proxy({}, {
      get() { throw new Error("payload must not be inspected"); },
      getPrototypeOf() { throw new Error("payload prototype must not be inspected"); },
      ownKeys() { throw new Error("payload must not be enumerated"); }
    })],
    ["revoked payload proxy", revokedMandate]
  ];
  for (const [label, mandate] of unsupportedMandates) {
    it("denies " + label + " pending a trusted mandate verifier", () => {
      expectDenied({ verifiedVisitCard: true, mandate }, UNAVAILABLE);
    });
  }

  // These are adversarial inputs, not an adopted mandate schema or real mandates.
  const claimedMandates = [
    ["revoked with unrelated scope", { state: "REVOKED", scope: "unrelated" }],
    ["expired", { state: "EXPIRED", not_after: "2000-01-01T00:00:00Z" }],
    ["wrong scope", { state: "ACTIVE", scope: "unrelated-action" }],
    ["wrong actor", { state: "ACTIVE", actor_ref: "TEST:OTHER" }],
    ["unknown issuer", { state: "ACTIVE", issuer_ref: "TEST:UNKNOWN" }],
    ["active", { state: "ACTIVE" }],
    ["granted", { state: "GRANTED" }],
    ["effective", { state: "EFFECTIVE" }],
    ["self-attested verification", { verified: true, approved: true, authorized: true }],
    ["signature metadata", { signature: "synthetic-not-a-signature", signer_verified: true }],
    ["unknown status", { state: "UNRECOGNIZED" }]
  ];
  for (const [label, mandate] of claimedMandates) {
    it("does not trust a " + label + " claim", () => {
      expectDenied({ verifiedVisitCard: true, mandate }, UNAVAILABLE);
    });
  }
});

describe("untrusted input has no execution or disclosure path", () => {
  it("rejects a mandate accessor without invoking it", () => {
    let calls = 0;
    const request = {
      verifiedVisitCard: true,
      get mandate() { calls += 1; throw new Error("getter must not run"); }
    };
    expectDenied(request, INVALID);
    assert.equal(calls, 0);
  });

  it("ignores authority getters supplied as extra fields", () => {
    let calls = 0;
    const request = {
      verifiedVisitCard: true,
      mandate: {},
      get approved() { calls += 1; throw new Error("must not run"); },
      get signer_verified() { calls += 1; throw new Error("must not run"); },
      get verifyMandate() { calls += 1; throw new Error("must not run"); }
    };
    expectDenied(request, UNAVAILABLE);
    assert.equal(calls, 0);
  });

  it("reads descriptors without ordinary property access or enumeration", () => {
    let reads = 0;
    let enumerations = 0;
    const request = new Proxy({ verifiedVisitCard: true, mandate: {} }, {
      get() { reads += 1; throw new Error("ordinary reads must not occur"); },
      ownKeys() { enumerations += 1; throw new Error("enumeration must not occur"); }
    });
    expectDenied(request, UNAVAILABLE);
    assert.equal(reads, 0);
    assert.equal(enumerations, 0);
  });

  it("does not inspect mandate status, issuer, scope or signature getters", () => {
    let calls = 0;
    const mandate = {};
    for (const name of ["state", "issuer_ref", "scope", "signature", "verified", "authorized"]) {
      Object.defineProperty(mandate, name, {
        get() { calls += 1; throw new Error("payload must not be inspected"); }
      });
    }
    expectDenied({ verifiedVisitCard: true, mandate }, UNAVAILABLE);
    assert.equal(calls, 0);
  });

  it("does not invoke a caller-supplied verifier or signer callback", () => {
    let calls = 0;
    const callback = () => { calls += 1; return true; };
    expectDenied({
      verifiedVisitCard: true,
      mandate: callback,
      verifyMandate: callback,
      verifySigner: callback,
      signer_verified: true,
      authority_granted: true
    }, UNAVAILABLE);
    assert.equal(calls, 0);
  });

  it("accepts an own-data null-prototype request only as a denied request", () => {
    const request = Object.assign(Object.create(null), { verifiedVisitCard: true, mandate: {} });
    expectDenied(request, UNAVAILABLE);
  });

  it("does not modify a frozen request or its mandate", () => {
    const mandate = Object.freeze({ state: "REVOKED", scope: "unrelated" });
    const request = Object.freeze({ verifiedVisitCard: true, mandate });
    const before = JSON.stringify(request);
    expectDenied(request, UNAVAILABLE);
    assert.equal(JSON.stringify(request), before);
    assert.equal(request.mandate, mandate);
  });

  it("returns only an immutable decision without echoing input", () => {
    const marker = "SYNTHETIC-PRIVATE-INPUT-CANARY";
    const result = expectDenied({
      verifiedVisitCard: true,
      mandate: { subject_ref: marker, signature: marker },
      evidence: marker
    }, UNAVAILABLE);
    assert.equal(JSON.stringify(result).includes(marker), false);
    assert.equal(Reflect.set(result, "authorized", true), false);
    assert.equal(Reflect.set(result, "evidence", marker), false);
    assert.throws(() => { result.authorized = true; }, TypeError);
    assert.deepEqual(result, { authorized: false, reason: UNAVAILABLE });
  });

  it("does not inspect the mandate when VisitCard verification is false", () => {
    let calls = 0;
    const request = {
      verifiedVisitCard: false,
      get mandate() { calls += 1; throw new Error("must not run"); }
    };
    expectDenied(request, VERIFICATION_REQUIRED);
    assert.equal(calls, 0);
  });
});

describe("cryptographic authenticity remains separate from authorization", () => {
  const vector = JSON.parse(readFileSync(new URL("../vectors/pvb-v1/golden-0001.json", import.meta.url), "utf8"));
  const signature = Buffer.from(vector.signature_hex, "hex");

  it("denies a genuinely verified golden VisitCard with an untrusted mandate", () => {
    const verifiedVisitCard = verifyWithPublicKey(vector.record, signature, vector.public_key_hex);
    assert.equal(verifiedVisitCard, true, "the existing golden-vector signature must verify");
    expectDenied({
      verifiedVisitCard,
      mandate: { state: "REVOKED", scope: "unrelated", issuer_ref: "TEST:UNKNOWN" }
    }, UNAVAILABLE);
  });

  it("denies a changed VisitCard before considering mandate presence", () => {
    const verifiedVisitCard = verifyWithPublicKey({ ...vector.record, epoch: vector.record.epoch + 1 }, signature, vector.public_key_hex);
    assert.equal(verifiedVisitCard, false, "identity-bound mutation must invalidate the signature");
    expectDenied({ verifiedVisitCard, mandate: { state: "EFFECTIVE" } }, VERIFICATION_REQUIRED);
  });
});
