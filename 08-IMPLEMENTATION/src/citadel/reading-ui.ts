/**
 * CITADEL-READING-UI-001
 * Framework-independent bridge for the owner-only Citadel Leeskompas.
 * No DOM access, no browser globals, no network traffic, no privileged effects.
 *
 * Integration must provide a StoragePort and render the resulting ViewModel.
 * Call actions only from direct user interaction, not component mount.
 */
import {
  REGIONS,
  disableAndClearReadingMemory,
  enableReadingMemory,
  readingStatus,
  resumeReadingRegion,
  saveReadingRegion,
  type RegionId,
  type ReadStatus,
  type StoragePort,
} from "./reading-state";
import {
  isKnownBookmark,
  readChapterBookmark,
  saveChapterBookmark,
  type ChapterBookmark,
  type ChapterRegistry,
} from "./reading-chapter";

export interface ReadingViewModel {
  readonly state: ReadStatus["kind"];
  readonly memoryLabel: string;
  readonly canResume: boolean;
  readonly resumeRegion: RegionId | null;
  readonly resumeLabel: string | null;
  readonly availableRegions: readonly RegionId[];
}

export interface ReadingActionResult {
  readonly view: ReadingViewModel;
  readonly succeeded: boolean;
  readonly message: string;
}

export const REGION_LABELS: Readonly<Record<RegionId, string>> = {
  "samenleving-natuur": "Samenleving & Natuur",
  "geheugen-tijd": "Geheugen & Tijd",
  "proof-bewijs": "Proof & Bewijs",
  "atelier": "Atelier",
  "eva": "EVA",
};

function viewFromStatus(status: ReadStatus): ReadingViewModel {
  const region = status.kind === "enabled" ? status.region : null;
  return {
    state: status.kind,
    memoryLabel:
      status.kind === "unavailable"
        ? "Leesplek onthouden: NIET BESCHIKBAAR"
        : status.kind === "enabled"
          ? "Leesplek onthouden: AAN"
          : "Leesplek onthouden: UIT",
    canResume: region !== null,
    resumeRegion: region,
    resumeLabel: region === null ? null : `Verder lezen · ${REGION_LABELS[region]}`,
    availableRegions: REGIONS,
  };
}

export function readingView(store: StoragePort): ReadingViewModel {
  return viewFromStatus(readingStatus(store));
}

/** Call only when the user explicitly toggles memory ON. */
export function requestEnableMemory(store: StoragePort): ReadingActionResult {
  const status = enableReadingMemory(store);
  return {
    view: viewFromStatus(status),
    succeeded: status.kind === "enabled",
    message:
      status.kind === "enabled"
        ? "Leesposities worden alleen op dit apparaat onthouden."
        : "De browser staat lokale opslag niet toe; onthouden is niet ingeschakeld.",
  };
}

/**
 * This must be called only after an intentional chapter selection.
 * Do not call on hydration, route restoration, initial paint or scroll observer.
 */
export function recordChapterSelection(
  store: StoragePort,
  region: unknown,
): ReadingActionResult {
  const saved = saveReadingRegion(store, region);
  return {
    view: readingView(store),
    succeeded: saved,
    message: saved
      ? "Leespositie lokaal bewaard."
      : "Leespositie niet bewaard: toestemming ontbreekt, regio onbekend of opslag is niet beschikbaar.",
  };
}

/**
 * Return a destination, never navigate automatically. Caller owns routing,
 * scroll and focus changes and must still check the route is accessible.
 */
export function requestResume(store: StoragePort): RegionId | null {
  return resumeReadingRegion(store);
}

/**
 * Integrator must first display a confirmation dialog. Never use this
 * from component unmount, logout, refresh, or implicit preference changes.
 */
export function requestClearMemory(
  store: StoragePort,
  confirmed: boolean,
): ReadingActionResult {
  if (!confirmed) {
    return {
      view: readingView(store),
      succeeded: false,
      message: "Wissen geannuleerd.",
    };
  }
  const status = disableAndClearReadingMemory(store);
  return {
    view: viewFromStatus(status),
    succeeded: status.kind === "disabled",
    message:
      status.kind === "disabled"
        ? "Leesposities en toestemming op dit apparaat gewist."
        : "Wissen kon niet worden bevestigd. Controleer de browserinstellingen.",
  };
}

/**
 * The integrator supplies the verified chapter registry for the displayed
 * region. Caller must validate access, then navigate/scroll/focus.
 * Legacy region-only bookmarks remain available through requestResume.
 */
export function requestResumeChapter(
  store: StoragePort,
  registry: ChapterRegistry,
): ChapterBookmark | null {
  return readChapterBookmark(store, registry);
}

/**
 * Trigger only from a deliberate click on a known chapter.
 * Saving does not navigate, authorize or emit events.
 */
export function recordChapterBookmark(
  store: StoragePort,
  registry: ChapterRegistry,
  candidate: unknown,
): ReadingActionResult {
  // Validate before mutating either stored position. A confirmed chapter
  // selection first replaces the legacy region (clearing stale v2 data),
  // then writes the newly selected chapter. A partial write cannot leave
  // an outdated chapter with priority over the new region.
  const valid = isKnownBookmark(candidate, registry);
  const regionSaved = valid && saveReadingRegion(store, candidate.region);
  const chapterSaved = regionSaved && saveChapterBookmark(store, registry, candidate);
  return {
    view: readingView(store),
    succeeded: chapterSaved,
    message: chapterSaved
      ? "Hoofdstuk en regio lokaal bewaard."
      : regionSaved
        ? "Regio bewaard; hoofdstuk kon niet worden opgeslagen."
        : "Hoofdstuk niet bewaard: toestemming, hoofdstukregistratie of opslag ontbreekt.",
  };
}
