(async () => {
  const [
    { ensureAnnotationElementDefined },
    { annotateExpressions, clearAnnotations },
    { collectMessageNodes, collectMessageNodesWithin, detectPlatform, extractMessageCandidate },
    { refreshAllAnnotations, startRendererTick },
    { getSettings, SETTINGS_STORAGE_KEY },
  ] = await Promise.all([
    import(chrome.runtime.getURL("components/annotation.js")),
    import(chrome.runtime.getURL("content/annotator.js")),
    import(chrome.runtime.getURL("content/extractor.js")),
    import(chrome.runtime.getURL("content/renderer.js")),
    import(chrome.runtime.getURL("utils/settings.js")),
  ]);

  const platform = detectPlatform();

  await ensureAnnotationElementDefined();

  let settings = await getSettings();
  let flushTimer = null;
  let observer = null;
  const pendingNodes = new Set();
  const stopRenderer = startRendererTick(document);

  document.body.dataset.tlPlatform = platform;
  applyChipTheme(settings.chipColor);

  function schedule(nodes) {
    for (const node of nodes) {
      if (!(node instanceof Element)) {
        continue;
      }

      const state = node.dataset.temporalLensState;

      if (state === "queued" || state === "processing" || state === "done") {
        continue;
      }

      node.dataset.temporalLensState = "queued";
      pendingNodes.add(node);
    }

    if (!flushTimer) {
      flushTimer = window.setTimeout(() => {
        void flush();
      }, 300);
    }
  }

  async function flush() {
    if (flushTimer) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }

    const nodes = [...pendingNodes];
    pendingNodes.clear();

    if (!settings.enabled || !settings.platforms?.[platform]) {
      for (const node of nodes) {
        node.dataset.temporalLensState = "";
      }

      return;
    }

    const candidates = [];

    for (const node of nodes) {
      node.dataset.temporalLensState = "processing";

      const candidate = extractMessageCandidate(node, platform);

      if (!candidate) {
        node.dataset.temporalLensState = "skipped";
        continue;
      }

      candidates.push(candidate);
    }

    if (candidates.length === 0) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "temporalLens:analyzeMessages",
        messages: candidates.map((candidate) => ({
          id: candidate.messageId,
          platform,
          postedAt: candidate.postedAt,
          text: candidate.text,
        })),
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      for (const candidate of candidates) {
        const result = response?.results?.[candidate.messageId];

        if (result) {
          annotateExpressions(candidate, result, settings);
        }

        candidate.messageNode.dataset.temporalLensState = "done";
      }

      refreshAllAnnotations(document);
    } catch (error) {
      console.error("Temporal Lens: failed to annotate messages.", error);

      for (const candidate of candidates) {
        candidate.messageNode.dataset.temporalLensState = "error";
      }
    }
  }

  function scanExistingMessages() {
    schedule(collectMessageNodes(platform));
  }

  function installObserver() {
    observer = new MutationObserver((mutations) => {
      const discoveredNodes = [];

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          discoveredNodes.push(...collectMessageNodesWithin(platform, node));
        }
      }

      if (discoveredNodes.length) {
        schedule(discoveredNodes);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_STORAGE_KEY]) {
      return;
    }

    settings = await getSettings();
    applyChipTheme(settings.chipColor);
    clearAnnotations(document);
    resetMessageStates();
    scanExistingMessages();
    refreshAllAnnotations(document);
  });

  window.addEventListener("beforeunload", () => {
    observer?.disconnect();
    stopRenderer?.();
  });

  installObserver();
  scanExistingMessages();
})();

function applyChipTheme(color) {
  const normalized = normalizeHexColor(color);

  if (!normalized) {
    return;
  }

  document.documentElement.style.setProperty("--tl-chip-color", normalized);
  document.documentElement.style.setProperty("--tl-chip-bg", hexToRgba(normalized, 0.14));
}

function resetMessageStates() {
  for (const node of document.querySelectorAll("[data-temporal-lens-state]")) {
    node.dataset.temporalLensState = "";
  }
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  return null;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);

  if (!normalized) {
    return `rgba(71, 82, 196, ${alpha})`;
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
