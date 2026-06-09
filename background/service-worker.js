import { buildMessageCacheKey, getCacheEntries, putCacheEntries } from "../utils/cache.js";
import { ensureDefaultSettings, getSettings, saveSettings } from "../utils/settings.js";
import { WEEKDAY_LOOKUP, buildIsoDateAnchor, buildNumericDateAnchor, buildSpecificDateAnchor } from "../utils/date.js";

const MIN_MODEL_CONFIDENCE = 0.7;
const LOCAL_BACKEND = "local";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  if (message.type === "temporalLens:getSettings") {
    void handleGetSettings(sendResponse);
    return true;
  }

  if (message.type === "temporalLens:saveSettings") {
    void handleSaveSettings(message.settings, sendResponse);
    return true;
  }

  if (message.type === "temporalLens:analyzeMessages") {
    void handleAnalyzeMessages(message.messages, sendResponse);
    return true;
  }

  return false;
});

async function handleGetSettings(sendResponse) {
  try {
    const settings = await getSettings();
    sendResponse({ settings });
  } catch (error) {
    console.error("Temporal Lens: failed to load settings.", error);
    sendResponse({ error: toErrorMessage(error) });
  }
}

async function handleSaveSettings(nextSettings, sendResponse) {
  try {
    const settings = await saveSettings(nextSettings ?? {});
    sendResponse({ settings });
  } catch (error) {
    console.error("Temporal Lens: failed to save settings.", error);
    sendResponse({ error: toErrorMessage(error) });
  }
}

async function handleAnalyzeMessages(messages, sendResponse) {
  try {
    const settings = await getSettings();
    const results = await analyzeMessages(messages ?? [], settings);
    sendResponse({ results });
  } catch (error) {
    console.error("Temporal Lens: analysis failed.", error);
    sendResponse({ error: toErrorMessage(error) });
  }
}

async function analyzeMessages(messages, settings) {
  if (!settings.enabled || !Array.isArray(messages) || messages.length === 0) {
    return {};
  }

  const normalizedMessages = messages
    .filter((message) => isEligibleMessage(message, settings))
    .map((message) => ({
      id: String(message.id),
      text: message.text.trim(),
      postedAt: message.postedAt,
      platform: message.platform,
    }));

  if (normalizedMessages.length === 0) {
    return {};
  }

  const keyByMessageId = new Map();
  const cacheKeys = await Promise.all(
    normalizedMessages.map(async (message) => {
      const key = await buildMessageCacheKey(message.text, message.postedAt);
      keyByMessageId.set(message.id, key);
      return key;
    }),
  );

  const cacheHits = await getCacheEntries(cacheKeys);
  const results = {};
  const misses = [];

  for (const message of normalizedMessages) {
    const cacheKey = keyByMessageId.get(message.id);
    const cached = cacheHits.get(cacheKey);

    if (cached) {
      results[message.id] = {
        backend: LOCAL_BACKEND,
        cached: true,
        expressions: normalizeExpressions(cached.expressions ?? []),
      };
      continue;
    }

    misses.push(message);
  }

  if (misses.length === 0) {
    return results;
  }

  const batchResult = analyzeBatchLocally(misses);
  const producedEntries = [];

  for (const item of batchResult) {
    const normalized = {
      backend: LOCAL_BACKEND,
      cached: false,
      expressions: normalizeExpressions(item.expressions ?? []),
    };

    results[item.id] = normalized;
    producedEntries.push({
      key: keyByMessageId.get(item.id),
      value: normalized,
    });
  }

  await putCacheEntries(producedEntries);
  return results;
}

function isEligibleMessage(message, settings) {
  if (!message?.id || typeof message?.text !== "string" || !message?.postedAt) {
    return false;
  }

  if (!message.text.trim()) {
    return false;
  }

  if (message.platform && settings.platforms?.[message.platform] === false) {
    return false;
  }

  return true;
}

function normalizeExpressions(expressions) {
  return expressions
    .map((expression) => ({
      original_text: typeof expression.original_text === "string" ? expression.original_text.trim() : "",
      anchor: typeof expression.anchor === "string" ? expression.anchor.trim() : "",
      confidence: Number(expression.confidence),
    }))
    .filter(
      (expression) =>
        Boolean(expression.original_text) &&
        Boolean(expression.anchor) &&
        Number.isFinite(expression.confidence) &&
        expression.confidence >= MIN_MODEL_CONFIDENCE,
    )
    .sort((left, right) => right.original_text.length - left.original_text.length);
}

function analyzeBatchLocally(messages) {
  return messages.map((message) => ({
    id: message.id,
    expressions: extractTemporalExpressions(message.text, message.postedAt),
  }));
}

function extractTemporalExpressions(text, postedAt) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const candidates = [];
  const seen = new Set();

  const patternDefinitions = [
    {
      regex: /\bby\s+tomorrow\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "next_day", confidence: 0.96 }),
    },
    {
      regex: /\btomorrow\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "next_day", confidence: 0.94 }),
    },
    {
      regex: /\byesterday\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "prev_day", confidence: 0.95 }),
    },
    {
      regex: /\b(?:later\s+today|today)\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "same_day", confidence: 0.9 }),
    },
    {
      regex: /\b(?:earlier\s+today)\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "same_day", confidence: 0.88 }),
    },
    {
      regex: /\btonight\b|\bthis\s+evening\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "same_day_part:evening", confidence: 0.84 }),
    },
    {
      regex: /\bthis\s+morning\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "same_day_part:morning", confidence: 0.84 }),
    },
    {
      regex: /\bthis\s+afternoon\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "same_day_part:afternoon", confidence: 0.84 }),
    },
    {
      regex: /\bin\s+about\s+an?\s+hour\b|\bin\s+an?\s+hour\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_1_hours", confidence: 0.9 }),
    },
    {
      regex: /\bin\s+a\s+few\s+hours?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_3_hours", confidence: 0.8 }),
    },
    {
      regex: /\bin\s+(\d+)\s+hours?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: `in_${match[1]}_hours`, confidence: 0.94 }),
    },
    {
      regex: /\bin\s+a\s+couple\s+days?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_2_days", confidence: 0.84 }),
    },
    {
      regex: /\bin\s+a\s+few\s+days?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_3_days", confidence: 0.8 }),
    },
    {
      regex: /\bin\s+(\d+)\s+days?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: `in_${match[1]}_days`, confidence: 0.94 }),
    },
    {
      regex: /\bin\s+(?:a\s+)?couple\s+weeks?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_2_weeks", confidence: 0.84 }),
    },
    {
      regex: /\bin\s+a\s+few\s+weeks?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_3_weeks", confidence: 0.8 }),
    },
    {
      regex: /\bin\s+(\d+)\s+weeks?\b/gi,
      build: (match) => ({ original_text: match[0], anchor: `in_${match[1]}_weeks`, confidence: 0.94 }),
    },
    {
      regex: /\bnext\s+month\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "in_1_months", confidence: 0.88 }),
    },
    {
      regex: /\blast\s+month\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "1_months_ago", confidence: 0.88 }),
    },
    {
      regex: /\ba\s+few\s+days?\s+ago\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "3_days_ago", confidence: 0.8 }),
    },
    {
      regex: /\b(\d+)\s+days?\s+ago\b/gi,
      build: (match) => ({ original_text: match[0], anchor: `${match[1]}_days_ago`, confidence: 0.94 }),
    },
    {
      regex: /\ba\s+few\s+weeks?\s+ago\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "3_weeks_ago", confidence: 0.8 }),
    },
    {
      regex: /\b(\d+)\s+weeks?\s+ago\b/gi,
      build: (match) => ({ original_text: match[0], anchor: `${match[1]}_weeks_ago`, confidence: 0.94 }),
    },
    {
      regex: /\bnext\s+week\b|\bstart\s+of\s+next\s+week\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "start_of_next_week", confidence: 0.88 }),
    },
    {
      regex: /\blast\s+week\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "7_days_ago", confidence: 0.86 }),
    },
    {
      regex: /\bthis\s+weekend\b|\bover\s+the\s+weekend\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "this_weekend", confidence: 0.88 }),
    },
    {
      regex: /\bby\s+end\s+of\s+(?:the\s+)?day\b|\bby\s+eod\b|\beod\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "end_of_day", confidence: 0.9 }),
    },
    {
      regex: /\bby\s+end\s+of\s+(?:the\s+)?week\b|\bby\s+eow\b|\beow\b/gi,
      build: (match) => ({ original_text: match[0], anchor: "end_of_week", confidence: 0.9 }),
    },
    {
      regex: /\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      build: (match) => ({
        original_text: match[0],
        anchor: `this_weekday:${WEEKDAY_LOOKUP[match[1].toLowerCase()]}`,
        confidence: 0.9,
      }),
    },
    {
      regex: /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      build: (match) => ({
        original_text: match[0],
        anchor: `next_weekday:${WEEKDAY_LOOKUP[match[1].toLowerCase()]}`,
        confidence: 0.92,
      }),
    },
    {
      regex: /\b(?:last|previous)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      build: (match) => ({
        original_text: match[0],
        anchor: `prev_weekday:${WEEKDAY_LOOKUP[match[1].toLowerCase()]}`,
        confidence: 0.9,
      }),
    },
    {
      regex:
        /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{2,4}))?\b/gi,
      build: (match) => {
        const anchor = buildSpecificDateAnchor(match[1], match[2], match[3], postedAt);
        return anchor ? { original_text: match[0], anchor, confidence: match[3] ? 0.96 : 0.9 } : null;
      },
    },
    {
      regex: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
      build: (match) => {
        const anchor = buildIsoDateAnchor(match[1], match[2], match[3]);
        return anchor ? { original_text: match[0], anchor, confidence: 0.98 } : null;
      },
    },
    {
      regex: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g,
      build: (match) => {
        const anchor = buildNumericDateAnchor(match[1], match[2], match[3], postedAt);
        return anchor ? { original_text: match[0], anchor, confidence: match[3] ? 0.95 : 0.84 } : null;
      },
    },
  ];

  for (const definition of patternDefinitions) {
    for (const match of normalizedText.matchAll(definition.regex)) {
      const expression = definition.build(match);

      if (!expression) {
        continue;
      }

      const start = match.index ?? normalizedText.indexOf(match[0]);
      const end = start + match[0].length;
      const marker = `${start}:${end}:${expression.original_text.toLowerCase()}:${expression.anchor}`;

      if (seen.has(marker) || isLikelyUrlFragment(normalizedText, start, end)) {
        continue;
      }

      seen.add(marker);
      candidates.push({
        ...expression,
        start,
        end,
      });
    }
  }

  return pruneOverlappingExpressions(candidates).map(({ original_text, anchor, confidence }) => ({
    original_text,
    anchor,
    confidence,
  }));
}

function pruneOverlappingExpressions(expressions) {
  const sorted = [...expressions].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }

    const leftLength = left.end - left.start;
    const rightLength = right.end - right.start;

    if (leftLength !== rightLength) {
      return rightLength - leftLength;
    }

    return right.confidence - left.confidence;
  });

  const accepted = [];

  for (const expression of sorted) {
    const previous = accepted[accepted.length - 1];

    if (previous && expression.start < previous.end) {
      continue;
    }

    accepted.push(expression);
  }

  return accepted.sort((left, right) => left.start - right.start);
}

function isLikelyUrlFragment(text, start, end) {
  const before = text.slice(Math.max(0, start - 12), start).toLowerCase();
  const after = text.slice(end, Math.min(text.length, end + 4)).toLowerCase();

  return before.includes("http://") || before.includes("https://") || before.endsWith("www.") || after.startsWith("/");
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
