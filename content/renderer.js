import { buildAnnotationTooltip, formatRelativeTarget } from "../utils/date.js";

export const REFRESH_INTERVAL_MS = 60_000;

let refreshIntervalId = null;

export function refreshAllAnnotations(rootNode = document) {
  const annotations = rootNode.querySelectorAll(".temporal-lens-annotation");
  const now = new Date();

  for (const annotation of annotations) {
    if (typeof annotation.refresh === "function") {
      annotation.refresh(now);
      continue;
    }

    refreshAnnotationElement(annotation, now);
  }
}

export function startRendererTick(rootNode = document) {
  if (!refreshIntervalId) {
    refreshIntervalId = window.setInterval(() => {
      refreshAllAnnotations(rootNode);
    }, REFRESH_INTERVAL_MS);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        refreshAllAnnotations(rootNode);
      }
    });
  }

  return () => {
    if (refreshIntervalId) {
      window.clearInterval(refreshIntervalId);
      refreshIntervalId = null;
    }
  };
}

function refreshAnnotationElement(annotation, now) {
  const targetIso = annotation.dataset.targetIso;
  const currentSpan = annotation.querySelector(".tl-current");

  if (!targetIso || !currentSpan) {
    return;
  }

  currentSpan.textContent = formatRelativeTarget(targetIso, now);
  annotation.dataset.expired = String(new Date(targetIso).getTime() < now.getTime());
  annotation.title = buildAnnotationTooltip(annotation.dataset.postedAt, targetIso, annotation.dataset.anchor);
}
