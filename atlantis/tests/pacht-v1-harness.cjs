"use strict";
const assert=require("node:assert/strict");
const {validate}=require("./validate-pacht-v1.cjs");
function base(){return {
pacht_id:"PACHT-00000001",subject:{id:"TEST",version:"1.0.0"},class:"PACHT-P",
scope:"test",jurisdiction:"PALACO",treaty_version:"DRAFT-1",codex_version:"DRAFT-1",
evidence:["fixture"],council_positions:Array.from({length:12},(_,i)=>({seat:i+1,finding:"PASS",evidence:["fixture"],reasoning:"reviewed",conflicts:[]})),
decision:{state:"ACTIVE",authorization_basis:"fixture only",dissent:[]},aseg:"NOT_APPLICABLE",cefcg:"FINAL",
validity:{valid_from:"2026-01-01T00:00:00Z",review_at:"2026-06-01T00:00:00Z",valid_until:"2027-01-01T00:00:00Z"},
integrity:{watermerk:"WM-TEST",hologram:"HO-TEST"},lineage:"IMMORTAL-TEST",challenge:"NONE",revocation:"NOT_REVOKED"}}
function bad(change,needle){const p=base();change(p);assert(validate(p).some(e=>e.includes(needle)));}
assert.deepEqual(validate(base()),[]);
bad(p=>p.evidence=[],"evidence");
bad(p=>p.council_positions.pop(),"twelve");
bad(p=>p.council_positions[11].seat=1,"unique");
bad(p=>p.decision.authorization_basis="","authorization_basis");
bad(p=>p.aseg="AMBIGUOUS","ASEG");
bad(p=>p.cefcg="IN_DOUBT","CEFCG");
bad(p=>p.council_positions[0].finding="FAIL","Council");
bad(p=>p.revocation="REVOKED","REVOKED");
bad(p=>p.integrity.watermerk="","WATERMERK");
bad(p=>p.integrity.hologram="","HOLOGRAM");
bad(p=>p.lineage="","IMMORTAL");
bad(p=>p.validity.review_at="2028-01-01T00:00:00Z","validity");
bad(p=>p.council_positions[0].conflicts=["MATERIAL-INTEREST"],"conflicted Council seat");
bad(p=>p.challenge="OPEN","challenge");
console.log("PACHT-V1 HARNESS PASS: 1 valid + 14 negative gates");
