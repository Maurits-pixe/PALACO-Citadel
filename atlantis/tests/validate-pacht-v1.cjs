#!/usr/bin/env node
"use strict";

/**
 * PACHT-V1 semantic validator.
 * No dependencies. Exit 0 only for a semantically valid envelope.
 * This validator does not grant PACHT; it only evaluates candidate data.
 */
const fs = require("node:fs");

function fail(errors, message) { errors.push(message); }

function validate(p) {
  const errors = [];
  if (!p || typeof p !== "object" || Array.isArray(p)) return ["root must be an object"];

  const required = ["pacht_id","subject","class","scope","jurisdiction","treaty_version","codex_version","evidence","council_positions","decision","aseg","cefcg","validity","integrity","lineage","challenge","revocation"];
  for (const k of required) if (!(k in p)) fail(errors, `missing required field: ${k}`);

  if (!Array.isArray(p.evidence) || p.evidence.length === 0 || p.evidence.some(x => typeof x !== "string" || !x.trim())) fail(errors, "evidence must contain at least one non-empty reference");

  const state = p.decision?.state;
  const councilRequired = state !== "PROPOSED";
  if (!Array.isArray(p.council_positions) || (councilRequired ? p.council_positions.length !== 12 : ![0,12].includes(p.council_positions.length))) {
    fail(errors, councilRequired ? "exactly twelve Council Positions are required after PROPOSED" : "PROPOSED Council Positions must be empty or a complete set of twelve");
  } else {
    const seats = p.council_positions.map(x => x && x.seat);
    const unique = new Set(seats);
    if (unique.size !== 12 || [...unique].some(x => !Number.isInteger(x) || x < 1 || x > 12)) fail(errors, "Council seats must be unique integers 1..12");
    for (const cp of p.council_positions) {
      if (!cp || !["PASS","CONDITIONAL","FAIL","IN_DOUBT"].includes(cp.finding)) fail(errors, "invalid Council finding");
      if (!Array.isArray(cp?.evidence)) fail(errors, "Council evidence must be an array");
      if (typeof cp?.reasoning !== "string" || !cp.reasoning.trim()) fail(errors, "Council reasoning is required");
      if (!Array.isArray(cp?.conflicts)) fail(errors, "Council conflicts must be an array");
    }
  }

  const activeLike = ["AUTHORIZED","ACTIVE"].includes(state);
  if (activeLike && (typeof p.decision?.authorization_basis !== "string" || !p.decision.authorization_basis.trim())) fail(errors, "AUTHORIZED/ACTIVE requires non-empty authorization_basis");
  if (activeLike && p.revocation === "REVOKED") fail(errors, "REVOKED cannot be AUTHORIZED/ACTIVE");
  if (activeLike && ["OPEN","IN_DOUBT"].includes(p.challenge)) fail(errors, "OPEN/IN_DOUBT challenge cannot be AUTHORIZED/ACTIVE");
  if (activeLike && ["AMBIGUOUS","NON_EQUIVALENT"].includes(p.aseg)) fail(errors, "ASEG ambiguity/non-equivalence fails closed");
  if (activeLike && ["DISPUTED","CONFLICTED","IN_DOUBT"].includes(p.cefcg)) fail(errors, "unresolved CEFCG state cannot be AUTHORIZED/ACTIVE");
  if (activeLike && Array.isArray(p.council_positions) && p.council_positions.some(x => ["FAIL","IN_DOUBT"].includes(x?.finding))) fail(errors, "unresolved Council FAIL/IN_DOUBT cannot be AUTHORIZED/ACTIVE");
  if (activeLike && Array.isArray(p.council_positions) && p.council_positions.some(x => Array.isArray(x?.conflicts) && x.conflicts.length > 0)) fail(errors, "ACTIVE/AUTHORIZED requires conflicted Council seat to be resolved or recused");

  if (p.revocation === "REVOKED" && state !== "REVOKED" && state !== "ARCHIVED") fail(errors, "revocation requires decision state REVOKED or ARCHIVED");

  const parseTime = (v, label) => {
    if (typeof v !== "string" || !v.trim() || Number.isNaN(Date.parse(v))) { fail(errors, `${label} must be an ISO-8601-compatible timestamp`); return NaN; }
    return Date.parse(v);
  };
  if (state === "PROPOSED" && p.validity !== null) fail(errors, "PROPOSED validity must be null");
  if (state !== "PROPOSED" && !p.validity) fail(errors, "post-PROPOSED validity is required");
  if (p.validity) {
    const from=parseTime(p.validity.valid_from,"valid_from"), review=parseTime(p.validity.review_at,"review_at"), until=parseTime(p.validity.valid_until,"valid_until");
    if ([from,review,until].every(Number.isFinite) && !(from <= review && review <= until)) fail(errors, "validity must satisfy valid_from <= review_at <= valid_until");
  }

  if (state === "PROPOSED" && p.integrity !== null) fail(errors, "PROPOSED integrity must be null");
  if (state !== "PROPOSED" && (typeof p.integrity?.watermerk !== "string" || !p.integrity.watermerk.trim())) fail(errors, "WATERMERK is required after PROPOSED");
  if (state !== "PROPOSED" && (typeof p.integrity?.hologram !== "string" || !p.integrity.hologram.trim())) fail(errors, "HOLOGRAM is required after PROPOSED");
  if (typeof p.lineage !== "string" || !p.lineage.trim()) fail(errors, "IMMORTAL lineage reference is required");

  return errors;
}

if (require.main === module) {
  const path = process.argv[2];
  if (!path) { console.error("usage: node validate-pacht-v1.cjs <envelope.json>"); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const errors = validate(data);
  if (errors.length) { console.error(JSON.stringify({valid:false,errors}, null, 2)); process.exit(1); }
  console.log(JSON.stringify({valid:true, note:"VALIDATION IS NOT PACHT AUTHORIZATION"}, null, 2));
}
module.exports = { validate };
