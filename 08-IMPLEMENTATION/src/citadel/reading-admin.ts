/**
 * CITADEL-READING-ADMIN-001
 *
 * Read-only, privacy-minimizing admin view model for the private Citadel
 * Leeskompas. Never grants owner access, authorizes routes, or reports
 * functional test PASS. Admin authentication is enforced by the host.
 */
import { inspectReadingPreflight, type ReadingPreflight } from "./reading-preflight";
import type { SiteRouteManifest } from "./reading-routes";
import type { StoragePort } from "./reading-state";

export type AdminCheckState = "PRESENT" | "HOLD" | "BLOCKED";
export type IntegrationEvidence = "unverified" | "reviewed";

export interface ReadingAdminEvidence {
  /** Owner-reviewed mapping against the ORIGINAL Sites source, not GitHub guesses. */
  readonly originalSiteRoutes: IntegrationEvidence;
  /** Host application independently verified to enforce identity and access. */
  readonly hostAccessGuards: IntegrationEvidence;
  /** Actual private Sites frontend connected to the mounted adapter. */
  readonly siteMounted: IntegrationEvidence;
  /** Completed by the owner; this module does not run or infer tests. */
  readonly ownerAcceptance: IntegrationEvidence;
}

export interface ReadingAdminCheck {
  readonly code: string;
  readonly label: string;
  readonly state: AdminCheckState;
  readonly detail: string;
}

export interface ReadingAdminSnapshot {
  /** DRAFT/HOLD until separately approved outside this module. */
  readonly release: "HOLD";
  readonly checks: readonly ReadingAdminCheck[];
  readonly note: string;
}

const check = (
  code: string,
  label: string,
  state: AdminCheckState,
  detail: string,
): ReadingAdminCheck => ({ code, label, state, detail });

/**
 * This assessment is not a security gate: only an already-authorized admin
 * page should render it. It outputs no paths, bookmarks, chapter labels,
 * session identifiers or stored key values.
 */
export function createReadingAdminSnapshot(
  storage: StoragePort,
  manifest: SiteRouteManifest,
  evidence: ReadingAdminEvidence,
): ReadingAdminSnapshot {
  const preflight: ReadingPreflight = inspectReadingPreflight(storage, manifest);
  const manifestValid = preflight.manifest.ok;
  const checks: ReadingAdminCheck[] = [
    check(
      "MANIFEST",
      "Routemanifest",
      manifestValid ? "PRESENT" : "BLOCKED",
      manifestValid ? "Vijf regio's structureel geldig." : "Routemanifest ongeldig of onvolledig.",
    ),
    check(
      "LOCAL_STORAGE",
      "Lokale opslag",
      preflight.memory === "unavailable" ? "BLOCKED" : "PRESENT",
      preflight.memory === "unavailable"
        ? "Browseropslag niet beschikbaar."
        : preflight.memory === "disabled"
          ? "Beschikbaar, maar leesgeheugen niet ingeschakeld."
          : "Leesgeheugen lokaal ingeschakeld.",
    ),
    check(
      "BOOKMARK",
      "Hervatmogelijkheid",
      preflight.canOfferResume ? "PRESENT" : "HOLD",
      preflight.canOfferResume
        ? "Een lokale hervatbestemming is bekend; toegang blijft afzonderlijk verplicht."
        : "Geen lokaal bruikbare hervatbestemming vastgesteld.",
    ),
  ];

  const addEvidence = (
    code: string,
    label: string,
    value: IntegrationEvidence,
  ): void => {
    checks.push(check(
      code,
      label,
      "HOLD",
      value === "reviewed"
        ? "Beoordeling door host opgegeven; onafhankelijk bewijs en acceptatie nog vereist."
        : "Geen externe beoordeling opgegeven; bewijs ontbreekt.",
    ));
  };
  addEvidence("SITE_ROUTES", "Originele Sites-routes", evidence.originalSiteRoutes);
  addEvidence("ACCESS", "Toegangscontrole host", evidence.hostAccessGuards);
  addEvidence("MOUNT", "Frontendintegratie", evidence.siteMounted);
  addEvidence("ACCEPTANCE", "Acceptatie eigenaar", evidence.ownerAcceptance);

  return {
    release: "HOLD",
    checks,
    note: "Dit is een read-only momentopname, geen autorisatie, uitgevoerde test of productie-vrijgave.",
  };
}

/**
 * Optional renderer: host supplies a pre-existing element in an authenticated
 * admin-only view. Only text nodes are written, never innerHTML or navigation.
 */
export function renderReadingAdminSnapshot(
  container: HTMLElement,
  snapshot: ReadingAdminSnapshot,
): void {
  const doc = container.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const heading = doc.createElement("h2");
  heading.textContent = "Citadel Leeskompas — beheercontrole (HOLD)";
  fragment.appendChild(heading);
  const list = doc.createElement("ul");
  for (const item of snapshot.checks) {
    const row = doc.createElement("li");
    row.textContent = `${item.label}: ${item.state} — ${item.detail}`;
    list.appendChild(row);
  }
  fragment.appendChild(list);
  const note = doc.createElement("p");
  note.textContent = snapshot.note;
  fragment.appendChild(note);
  container.replaceChildren(fragment);
}
