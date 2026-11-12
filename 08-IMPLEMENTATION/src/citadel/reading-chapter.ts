/**
 * CITADEL-READING-CHAPTER-001
 * A versioned, consent-gated chapter bookmark.
 *
 * Chapter IDs are validated against a caller-supplied registry derived from
 * the rendered site's actual chapter list. Do not trust URL fragments or
 * imported JSON as the registry. This is NOT identity, evidence or authority.
 */
import {
  readingStatus,
  type RegionId,
  type StoragePort,
} from "./reading-state";

export const CHAPTER_POSITION_KEY = "citadel.reading.v2.chapter";
const MAX_CHAPTER_ID_LENGTH = 96;
const MAX_RAW_LENGTH = 512;

export interface ChapterBookmark {
  readonly region: RegionId;
  readonly chapterId: string;
}

export type ChapterRegistry =
  Readonly<Partial<Record<RegionId, readonly string[]>>>;

function validChapterId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CHAPTER_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

function isKnownBookmark(
  value: unknown,
  registry: ChapterRegistry,
): value is ChapterBookmark {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    !Object.prototype.hasOwnProperty.call(record, "region") ||
    !Object.prototype.hasOwnProperty.call(record, "chapterId")
  ) return false;
  const region = record.region;
  if (typeof region !== "string") return false;
  if (!validChapterId(record.chapterId)) return false;
  const chapters = (registry as Readonly<Record<string, readonly string[] | undefined>>)[region];
  return Array.isArray(chapters) && chapters.includes(record.chapterId);
}

/** Only read after affirmative consent and validation against site chapters. */
export function readChapterBookmark(
  store: StoragePort,
  registry: ChapterRegistry,
): ChapterBookmark | null {
  if (readingStatus(store).kind !== "enabled") return null;
  try {
    const raw = store.getItem(CHAPTER_POSITION_KEY);
    if (raw === null || raw.length > MAX_RAW_LENGTH) return null;
    const value: unknown = JSON.parse(raw);
    if (!isKnownBookmark(value, registry)) return null;
    return { region: value.region, chapterId: value.chapterId };
  } catch {
    return null;
  }
}

/**
 * Invoke exclusively on an explicit user chapter selection.
 * Reading and initial rendering must never write.
 */
export function saveChapterBookmark(
  store: StoragePort,
  registry: ChapterRegistry,
  candidate: unknown,
): boolean {
  if (readingStatus(store).kind !== "enabled") return false;
  if (!isKnownBookmark(candidate, registry)) return false;
  const value = JSON.stringify({
    region: candidate.region,
    chapterId: candidate.chapterId,
  });
  if (value.length > MAX_RAW_LENGTH) return false;
  try {
    store.setItem(CHAPTER_POSITION_KEY, value);
    return store.getItem(CHAPTER_POSITION_KEY) === value;
  } catch {
    return false;
  }
}

/**
 * This helper removes only the chapter bookmark. Use the existing
 * disableAndClearReadingMemory for complete consent revocation.
 */
export function removeChapterBookmark(store: StoragePort): boolean {
  try {
    store.removeItem(CHAPTER_POSITION_KEY);
    return store.getItem(CHAPTER_POSITION_KEY) === null;
  } catch {
    return false;
  }
}
