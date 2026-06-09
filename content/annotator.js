import { resolveAnchor, formatRelativeTarget, buildAnnotationTooltip } from "../utils/date.js";

const MIN_DISPLAY_CONFIDENCE = 0.7;

export function annotateExpressions(candidate, analysis, settings) {
  const expressions = selectDisplayableExpressions(analysis?.expressions ?? [], settings);
  let appliedCount = 0;

  for (const expression of expressions) {
    const targetDate = resolveAnchor(expression.anchor, candidate.postedAt);

    if (!targetDate) {
      continue;
    }

    const annotation = wrapNextMatch(candidate.textContainer, expression.original_text, {
      anchor: expression.anchor,
      confidenceBand: classifyConfidence(expression.confidence, settings.confidenceThreshold),
      confidenceValue: expression.confidence,
      originalText: expression.original_text,
      postedAt: candidate.postedAt,
      targetIso: targetDate.toISOString(),
    });

    if (annotation) {
      appliedCount += 1;
    }
  }

  return appliedCount;
}

export function clearAnnotations(rootNode = document) {
  const annotations = rootNode.querySelectorAll(".temporal-lens-annotation");

  for (const annotation of annotations) {
    const text = document.createTextNode(annotation.dataset.original || annotation.textContent || "");
    annotation.replaceWith(text);
  }
}

function selectDisplayableExpressions(expressions, settings) {
  return expressions
    .filter((expression) => Number.isFinite(expression.confidence) && expression.confidence >= MIN_DISPLAY_CONFIDENCE)
    .filter((expression) => {
      if (expression.confidence >= settings.confidenceThreshold) {
        return true;
      }
      return settings.showMediumConfidence;
    })
    .sort((left, right) => right.original_text.length - left.original_text.length);
}

function classifyConfidence(confidence, threshold) {
  return confidence >= threshold ? "high" : "medium";
}

function wrapNextMatch(rootNode, originalText, metadata) {
  const match = findTextNodeMatch(rootNode, originalText);

  if (!match) {
    return null;
  }

  const { textNode, start, end } = match;
  const before = textNode.nodeValue.slice(0, start);
  const matchedText = textNode.nodeValue.slice(start, end);
  const after = textNode.nodeValue.slice(end);
  const fragment = document.createDocumentFragment();

  if (before) {
    fragment.append(document.createTextNode(before));
  }

  const annotation = document.createElement("span");
  annotation.className = "temporal-lens-annotation";
  annotation.dataset.anchor = metadata.anchor;
  annotation.dataset.confidence = metadata.confidenceBand;
  annotation.dataset.confidenceValue = metadata.confidenceValue.toFixed(2);
  annotation.dataset.original = matchedText;
  annotation.dataset.postedAt = metadata.postedAt;
  annotation.dataset.targetIso = metadata.targetIso;
  annotation.dataset.expired = String(new Date(metadata.targetIso).getTime() < Date.now());
  annotation.title = buildAnnotationTooltip(metadata.postedAt, metadata.targetIso, metadata.anchor);

  const originalSpan = document.createElement("span");
  originalSpan.className = "tl-original";
  originalSpan.textContent = matchedText;

  const currentSpan = document.createElement("span");
  currentSpan.className = "tl-current";
  currentSpan.textContent = metadata.targetIso ? formatRelativeTarget(metadata.targetIso) : "";

  annotation.append(originalSpan, currentSpan);
  fragment.append(annotation);

  if (after) {
    fragment.append(document.createTextNode(after));
  }

  textNode.parentNode.replaceChild(fragment, textNode);
  return annotation;
}

function findTextNodeMatch(rootNode, originalText) {
  const needle = originalText.trim().toLowerCase();

  if (!needle) {
    return null;
  }

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parentElement = node.parentElement;

      if (
        parentElement?.closest(".temporal-lens-annotation, code, pre, textarea, input, [contenteditable='true']")
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentNode = walker.nextNode();

  while (currentNode) {
    const haystack = currentNode.nodeValue.toLowerCase();
    const index = haystack.indexOf(needle);

    if (index !== -1) {
      return {
        textNode: currentNode,
        start: index,
        end: index + needle.length,
      };
    }

    currentNode = walker.nextNode();
  }

  return null;
}
