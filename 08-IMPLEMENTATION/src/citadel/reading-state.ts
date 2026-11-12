/**
 * CITADEL-READING-STATE-001
 * Local, consent-gated reading progress. Presentation data only:
 * never identity, evidence, authorization or server-synchronized state.
 *
 * Pure module; must be wired into the site by a separate reviewed change.
 */
export const REGIONS = [
  "samenleving-natuur",
  "geheugen-tijd",
  "proof-bewijs",
  "atelier",
  "eva",
] as const;

export type RegionId = (typeof REGIONS)[number];
export type ReadStatus =
  | { kind: "disabled" }
  | { kind: "enabled"; region: RegionId | null }
  | { kind: "unavailable" };

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CONSENT_KEY = "citadel.reading.v1.consent";
const POSITION_KEY = "citadel.reading.v1.position";
const CHAPTER_POSITION_KEY = "citadel.reading.v2.chapter";
const MAX_STORED_BYTES = 2048;

function isRegionId(value: unknown): value is RegionId {
  return typeof value === "string" &&
    (REGIONS as readonly string[]).includes(value);
}

function safeRead(store: StoragePort, key: string): string | null | undefined {
  try {
    const value = store.getItem(key);
    return value !== null && value.length <= MAX_STORED_BYTES ? value : null;
  } catch {
    return undefined;
  }
}

function safeWrite(store: StoragePort, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return store.getItem(key) === value;
  } catch {
    return false;
  }
}

function safeRemove(store: StoragePort, key: string): boolean {
  try {
    store.removeItem(key);
    return store.getItem(key) === null;
  } catch {
    return false;
  }
}

/**
 * Fail closed if storage is blocked or unavailable.
 * Consent is never inferred from an existing position.
 */
export function readingStatus(store: StoragePort): ReadStatus {
  const consent = safeRead(store, CONSENT_KEY);
  if (consent === undefined) return { kind: "unavailable" };
  if (consent !== "yes") return { kind: "disabled" };

  const raw = safeRead(store, POSITION_KEY);
  if (raw === undefined) return { kind: "unavailable" };
  return { kind: "enabled", region: isRegionId(raw) ? raw : null };
}

/**
 * Explicit user gesture required by the caller. The UI must not invoke this
 * on initialization, focus, visibility change, or automatic navigation.
 */
export function enableReadingMemory(store: StoragePort): ReadStatus {
  if (!safeWrite(store, CONSENT_KEY, "yes")) {
    return { kind: "unavailable" };
  }
  return readingStatus(store);
}

/**
 * Save only a known region, and only after effective consent.
 * Returns false rather than claiming persistence when storage is blocked.
 */
export function saveReadingRegion(
  store: StoragePort,
  region: unknown,
): boolean {
  if (!isRegionId(region)) return false;
  if (readingStatus(store).kind !== "enabled") return false;
  // A deliberate region selection supersedes any older chapter bookmark.
  // If we cannot clear the stale chapter, do not report a successful save.
  if (!safeRemove(store, CHAPTER_POSITION_KEY)) return false;
  return safeWrite(store, POSITION_KEY, region);
}

/**
 * The saved position must not be overwritten merely by loading a page.
 * Call only after a deliberate chapter-selection or progress action.
 */
export function resumeReadingRegion(store: StoragePort): RegionId | null {
  const state = readingStatus(store);
  return state.kind === "enabled" ? state.region : null;
}

/**
 * Clearing requires user confirmation at the UI layer. Independent
 * rondreis/history keys are deliberately untouched.
 */
export function disableAndClearReadingMemory(store: StoragePort): ReadStatus {
  const positionRemoved = safeRemove(store, POSITION_KEY);
  const chapterRemoved = safeRemove(store, CHAPTER_POSITION_KEY);
  const consentRemoved = safeRemove(store, CONSENT_KEY);
  if (!positionRemoved || !chapterRemoved || !consentRemoved) {
    return { kind: "unavailable" };
  }
  return { kind: "disabled" };
}
