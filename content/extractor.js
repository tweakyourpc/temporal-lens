const PLATFORM_CONFIG = {
  discord: {
    matchers: [/^https:\/\/discord\.com\//i],
    messageSelectors: ['li[id^="chat-messages-"]', 'div[id^="chat-messages-"]'],
    textSelectors: ['[id^="message-content-"]', '[class*="markup"]'],
    timestampSelectors: ["time[datetime]", "[datetime]"],
  },
  slack: {
    matchers: [/^https:\/\/app\.slack\.com\//i],
    messageSelectors: ['[data-qa="virtual-list-item"]', '[data-qa="message_container"]'],
    textSelectors: ['[data-qa="message-text"]', '[data-qa="message-text-content"]'],
    timestampSelectors: ['time[datetime]', '[data-qa="message_timestamp"] time[datetime]'],
  },
  web: {
    matchers: [/^https?:\/\//i],
    messageSelectors: [
      '[role="article"]',
      "article",
      "main p",
      "main li",
      "section p",
      "section li",
      "blockquote",
      "p",
      "li",
    ],
    textSelectors: [],
    timestampSelectors: ["time[datetime]", "[datetime]", "[data-time]", "[data-timestamp]", "[data-ts]"],
    allowSelfTextContainer: true,
  },
};

export function detectPlatform(locationHref = window.location.href) {
  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    if (platform === "web") {
      continue;
    }

    if (config.matchers.some((matcher) => matcher.test(locationHref))) {
      return platform;
    }
  }

  return PLATFORM_CONFIG.web.matchers.some((matcher) => matcher.test(locationHref)) ? "web" : null;
}

export function collectMessageNodes(platform) {
  const config = PLATFORM_CONFIG[platform];

  if (!config) {
    return [];
  }

  const nodes = [];

  for (const selector of config.messageSelectors) {
    nodes.push(...document.querySelectorAll(selector));
  }

  return uniqueElements(nodes);
}

export function collectMessageNodesWithin(platform, rootNode) {
  const config = PLATFORM_CONFIG[platform];

  if (!config || !(rootNode instanceof Element)) {
    return [];
  }

  const matches = [];

  for (const selector of config.messageSelectors) {
    if (rootNode.matches(selector)) {
      matches.push(rootNode);
    }

    matches.push(...rootNode.querySelectorAll(selector));
  }

  return uniqueElements(matches);
}

export function extractMessageCandidate(messageNode, platform) {
  const config = PLATFORM_CONFIG[platform];

  if (!config || !(messageNode instanceof Element)) {
    return null;
  }

  const textContainer = findTextContainer(messageNode, config);

  if (!textContainer) {
    return null;
  }

  const text = normalizeVisibleText(textContainer);

  if (!text) {
    return null;
  }

  const postedAt = extractPostedAt(messageNode, config);

  if (!postedAt) {
    return null;
  }

  return {
    messageId: extractMessageId(messageNode, platform, postedAt, text),
    messageNode,
    platform,
    postedAt,
    text,
    textContainer,
  };
}

function findTextContainer(messageNode, config) {
  if (config.allowSelfTextContainer && isAnnotatableTextBlock(messageNode)) {
    return messageNode;
  }

  for (const selector of config.textSelectors) {
    const match = messageNode.querySelector(selector);

    if (match) {
      return match;
    }
  }

  return null;
}

function normalizeVisibleText(node) {
  const raw = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
  return raw;
}

function extractPostedAt(messageNode, config) {
  for (const selector of config.timestampSelectors) {
    const candidate = messageNode.querySelector(selector);
    const parsed = parseDateFromElement(candidate);

    if (parsed) {
      return parsed;
    }
  }

  for (const candidate of messageNode.querySelectorAll("[title], [aria-label], [data-ts], [datetime]")) {
    const parsed = parseDateFromElement(candidate);

    if (parsed) {
      return parsed;
    }
  }

  return extractPagePublishedAt() || new Date().toISOString();
}

function parseDateFromElement(element) {
  if (!(element instanceof Element)) {
    return null;
  }

  const datetimeValue = element.getAttribute("datetime");

  if (datetimeValue) {
    const parsed = Date.parse(datetimeValue);

    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  const tsValue = element.getAttribute("data-ts");

  if (tsValue && /^\d+$/.test(tsValue)) {
    const numeric = Number(tsValue);
    const asMilliseconds = tsValue.length > 10 ? numeric : numeric * 1000;
    return new Date(asMilliseconds).toISOString();
  }

  for (const attributeName of ["data-time", "data-timestamp"]) {
    const value = element.getAttribute(attributeName);
    const parsed = parseDateLikeValue(value);

    if (parsed) {
      return parsed;
    }
  }

  for (const attributeName of ["title", "aria-label"]) {
    const value = element.getAttribute(attributeName);

    if (!value) {
      continue;
    }

    const parsed = Date.parse(value);

    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

function extractPagePublishedAt() {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[property="og:updated_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[itemprop="datePublished"]',
  ];

  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content");
    const parsed = parseDateLikeValue(value);

    if (parsed) {
      return parsed;
    }
  }

  const modified = parseDateLikeValue(document.lastModified);
  return modified;
}

function parseDateLikeValue(value) {
  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    const asMilliseconds = value.length > 10 ? numeric : numeric * 1000;
    return new Date(asMilliseconds).toISOString();
  }

  const parsed = Date.parse(value);

  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return null;
}

function extractMessageId(messageNode, platform, postedAt, text) {
  const directId =
    messageNode.id ||
    messageNode.getAttribute("data-list-item-id") ||
    messageNode.getAttribute("data-qa") ||
    messageNode.getAttribute("data-qa-message-id");

  if (directId) {
    return `${platform}:${directId}`;
  }

  return `${platform}:${postedAt}:${simpleHash(text)}`;
}

function uniqueElements(elements) {
  return [...new Set(elements)].filter(isAnnotatableTextBlock);
}

function isAnnotatableTextBlock(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  if (
    element.closest(
      ".temporal-lens-annotation, script, style, noscript, template, svg, canvas, nav, header, footer, aside, form, button, select, textarea, input, [contenteditable='true'], [aria-hidden='true']",
    )
  ) {
    return false;
  }

  const text = normalizeVisibleText(element);

  if (text.length < 8 || text.length > 2000) {
    return false;
  }

  return /\b(?:today|tomorrow|yesterday|next|last|previous|ago|weekends?|weeks?|months?|hours?|days?|couple|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s+(?:hours?|days?|weeks?))\b/i.test(
    text,
  );
}

function simpleHash(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
