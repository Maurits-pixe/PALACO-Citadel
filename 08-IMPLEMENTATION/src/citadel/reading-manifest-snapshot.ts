/**
 * CITADEL-READING-MANIFEST-SNAPSHOT-001
 *
 * Take an immutable, defensive copy of the host-reviewed five-region
 * manifest. Never retain caller-owned chapter arrays or route objects.
 * No site access, storage, routing, DOM or authorization side effects.
 */
import { admitReadingManifest } from "./reading-manifest-gate";
import { REGIONS } from "./reading-state";
import type { RegionId } from "./reading-state";
import type { SiteRouteManifest, RegionRoute, ChapterRoute } from "./reading-routes";

/**
 * A snapshot is not proof that routes exist on the original Sites project.
 * That verification and access enforcement remain the host's responsibility.
 */
export function snapshotReadingManifest(value: unknown): SiteRouteManifest | null {
  try {
    if (!admitReadingManifest(value).ok) return null;
    const source = value as Readonly<Record<RegionId, RegionRoute>>;
    const result: Partial<Record<RegionId, RegionRoute>> = Object.create(null);
    for (const region of REGIONS) {
      const route = source[region];
      const chapters: ChapterRoute[] = route.chapters.map(chapter =>
        Object.freeze({ chapterId: chapter.chapterId, label: chapter.label }),
      );
      result[region] = Object.freeze({
        path: route.path,
        chapters: Object.freeze(chapters),
      });
    }
    // Host-supplied objects may be mutable/getter-based; revalidate the
    // detached copy before using it for any navigation resolution.
    if (!admitReadingManifest(result).ok) return null;
    return Object.freeze(result);
  } catch {
    return null;
  }
}
