import { inspectHandoff } from "./handoff.mjs";

/**
 * Local triage only; never verifies evidence, identity, consent, or authority.
 * READY_FOR_HUMAN_REVIEW means the intake packet is sufficiently documented
 * for a person to start examining it, not that its contents are true.
 */
export function triageHandoff(doc) {
  const check=inspectHandoff(doc);
  if(!check.ok)return Object.freeze({
    status:"INVALID_PACKET",eligible:false,authority:"NONE",edtrIssued:false,
    issues:[{code:"SCHEMA_OR_INTEGRITY_INVALID",detail:check.reason}],
    review:"NOT_STARTED"
  });
  const issues=[];
  if(check.partial)issues.push({code:"PARTIAL_LINEAGE",detail:"Een of meer oudere voorgangers ontbreken in het lokale pakket."});
  const noSource=doc.lineage.filter(x=>!x.source.trim());
  if(noSource.length)issues.push({code:"MISSING_SOURCE",detail:"Bronverwijzing ontbreekt bij "+noSource.length+" versie(s)."});
  const status=issues.length?"NEEDS_SOURCE_MATERIAL":"READY_FOR_HUMAN_REVIEW";
  return Object.freeze({
    status,eligible:issues.length===0,authority:"NONE",edtrIssued:false,
    review:"NOT_STARTED",issues,selectedRecordId:doc.origin.selectedRecordId,
    receivedLineageCount:doc.lineage.length,
    sourceVerified:false,clockAttested:false,identityVerified:false
  });
}

/** Exportable intake checklist: never turns technical readiness into proof. */
export function buildTriageRecord(doc,notes="") {
  const assessment=triageHandoff(doc);
  if(assessment.status==="INVALID_PACKET")throw new Error("Ongeldig dossier kan niet worden beoordeeld.");
  if(typeof notes!=="string"||notes.length>1000)throw new Error("Ongeldige beoordelingsnotitie.");
  return {
    schema:"PALACO-CITADEL-TRIAGE-DRAFT-1",
    documentType:"LOCAL_INTAKE_REVIEW_NOTE",
    selectedRecordId:assessment.selectedRecordId,
    triageStatus:assessment.status,
    issues:assessment.issues,
    observation:notes,
    review:"NOT_VERIFIED",authority:"NONE",edtrIssued:false,
    sourceVerified:false,clockAttested:false,identityVerified:false
  };
}
