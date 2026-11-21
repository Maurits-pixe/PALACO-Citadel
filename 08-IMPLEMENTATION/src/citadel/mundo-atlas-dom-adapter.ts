/**
 * MUNDO-ATLAS-DOM-ADAPTER-013
 *
 * Protected host presentation adapter. Does not authorize, fetch, subscribe,
 * discover routes or mount itself. Host must call it ONLY via an already
 * authorized AtlasViewHost.mount() and revoke on every context transition.
 */
import type { AtlasView } from "./mundo-atlas-render-projection";
import type { MountedAtlasView } from "./mundo-atlas-mount-lifecycle";

/**
 * Mounts a scoped, accessible view using textContent and validated numeric
 * positions only. No innerHTML, external links, images, event handlers, or
 * private DOM selectors. Empty views do not invent map points or evidence.
 *
 * The container MUST be an authenticated, access-controlled host element;
 * this adapter cannot enforce access control on its own.
 */
export function mountAtlasDomView(
  container: HTMLElement,
  view: AtlasView,
): MountedAtlasView {
  const doc = container.ownerDocument;
  const root = doc.createElement("section");
  root.className = "palaco-atlas-protected-view";
  root.setAttribute("aria-label", "Beschermde MUNDO Atlasweergave");
  root.dataset.worldId = view.worldId;
  const heading = doc.createElement("h2");
  heading.textContent = view.kind === "geography"
    ? "Geografische laag · " + view.worldId
    : "Bewijsreferenties · " + view.worldId;
  root.append(heading);

  const status = doc.createElement("p");
  status.textContent = "Goedgekeurde bronrevisie: " + view.revision;
  root.append(status);

  if (view.kind === "geography") {
    const intro = doc.createElement("p");
    intro.textContent =
      "Schematische equirectangulaire puntprojectie; geen grens- of satellietkaart.";
    root.append(intro);
    const stage = doc.createElement("div");
    stage.className = "palaco-atlas-protected-stage";
    stage.setAttribute("role", "group");
    stage.setAttribute("aria-label", "Kaartpunten");
    stage.style.position = "relative";
    stage.style.width = "100%";
    stage.style.aspectRatio = "2 / 1";
    stage.style.border = "1px solid currentColor";
    stage.style.overflow = "hidden";
    for (const marker of view.markers) {
      // Defense in depth: NEVER interpolate untrusted coordinates directly
      // without checking their bounds, even after host verification.
      if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y) ||
          marker.x < 0 || marker.x > 1 || marker.y < 0 || marker.y > 1) {
        throw new Error("MUNDO_ATLAS_INVALID_RENDER_POSITION");
      }
      const point = doc.createElement("span");
      point.className = "palaco-atlas-protected-marker";
      point.style.position = "absolute";
      point.style.left = String(marker.x * 100) + "%";
      point.style.top = String(marker.y * 100) + "%";
      point.style.transform = "translate(-50%, -50%)";
      point.textContent = "●";
      point.setAttribute("title", marker.label);
      point.setAttribute("aria-label", marker.label);
      stage.append(point);
    }
    root.append(stage);
    const list = doc.createElement("ul");
    list.setAttribute("aria-label", "Kaartpunten in tekst");
    for (const marker of view.markers) {
      const item = doc.createElement("li");
      item.textContent = marker.label + " (" + marker.id + ")";
      list.append(item);
    }
    root.append(list);
  } else {
    const list = doc.createElement("ul");
    list.setAttribute("aria-label", "Bewijsreferenties");
    for (const entry of view.references) {
      const item = doc.createElement("li");
      item.textContent = entry.id + " · " + entry.citation +
        " · SHA-256 " + entry.digestSha256;
      list.append(item);
    }
    root.append(list);
  }

  // Construct detached. Only after successful assembly is it presented.
  container.append(root);
  let disposed = false;
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      // Removal is scoped to this instance and cannot remove a newer mount.
      root.remove();
    },
  };
}
