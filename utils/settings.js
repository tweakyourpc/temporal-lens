export const SETTINGS_STORAGE_KEY = "temporalLensSettings";

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  confidenceThreshold: 0.85,
  showMediumConfidence: true,
  platforms: {
    discord: true,
    slack: true,
    web: true,
  },
  chipColor: "#4752c4",
});

export async function ensureDefaultSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);

  if (!stored[SETTINGS_STORAGE_KEY]) {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS });
    return DEFAULT_SETTINGS;
  }

  const normalized = normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  return normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}

export function normalizeSettings(settings) {
  const candidate = settings && typeof settings === "object" ? settings : {};

  return {
    enabled: candidate.enabled !== false,
    confidenceThreshold: clampThreshold(candidate.confidenceThreshold),
    showMediumConfidence: candidate.showMediumConfidence !== false,
    platforms: {
      discord: candidate.platforms?.discord !== false,
      slack: candidate.platforms?.slack !== false,
      web: candidate.platforms?.web !== false,
    },
    chipColor: normalizeColor(candidate.chipColor) || DEFAULT_SETTINGS.chipColor,
  };
}

function clampThreshold(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.confidenceThreshold;
  }

  return Math.min(0.99, Math.max(0.7, Number(numeric.toFixed(2))));
}

function normalizeColor(value) {
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
