import { buildAnnotationTooltip, formatRelativeTarget } from "../utils/date.js";

export async function ensureAnnotationElementDefined() {
  // no-op: no longer using custom elements
}

export function createAnnotationElement(original, postedAt, targetIso, anchor, confidence) {
  const wrapper = document.createElement("span");
  wrapper.className = "temporal-lens-annotation";
  wrapper.dataset.original = original;
  wrapper.dataset.postedAt = postedAt;
  wrapper.dataset.targetIso = targetIso;
  wrapper.dataset.anchor = anchor;
  wrapper.dataset.confidence = confidence;

  const originalSpan = document.createElement("span");
  originalSpan.className = "tl-original";
  originalSpan.textContent = original;

  const currentSpan = document.createElement("span");
  currentSpan.className = "tl-current";

  const now = new Date();
  currentSpan.textContent = formatRelativeTarget(targetIso, now);
  wrapper.dataset.expired = String(new Date(targetIso).getTime() < now.getTime());
  wrapper.title = buildAnnotationTooltip(postedAt, targetIso, anchor);

  wrapper.append(originalSpan, currentSpan);
  return wrapper;
}

export function refreshAnnotationElement(el, now = new Date()) {
  const targetIso = el.dataset.targetIso;
  const currentSpan = el.querySelector(".tl-current");
  if (!currentSpan || !targetIso) return;
  currentSpan.textContent = formatRelativeTarget(targetIso, now);
  el.dataset.expired = String(new Date(targetIso).getTime() < now.getTime());
  el.title = buildAnnotationTooltip(el.dataset.postedAt, targetIso, el.dataset.anchor);
}