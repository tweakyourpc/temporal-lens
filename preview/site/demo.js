import { ensureAnnotationElementDefined } from "/components/annotation.js";

await ensureAnnotationElementDefined();

const response = await fetch("/api/demo-state", { cache: "no-store" });

if (!response.ok) {
  throw new Error(`Failed to load demo state: ${response.status}`);
}

const state = await response.json();
const generatedAt = document.getElementById("generated-at");
const feed = document.getElementById("demo-feed");

generatedAt.textContent = `Generated ${new Date(state.generatedAt).toLocaleString()}`;

for (const message of state.messages) {
  feed.append(buildMessageCard(message));
}

window.setInterval(() => {
  for (const annotation of document.querySelectorAll("temporal-lens-annotation")) {
    if (typeof annotation.refresh === "function") {
      annotation.refresh(new Date());
    }
  }
}, 60_000);

function buildMessageCard(message) {
  const article = document.createElement("article");
  article.className = `message-card platform-${message.platform}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.innerHTML = `<span>${escapeHtml(message.author)}</span><span>${new Date(message.postedAt).toLocaleString()}</span>`;

  const body = document.createElement("p");
  body.className = "message-body";

  const start = message.text.indexOf(message.annotation.original);

  if (start === -1) {
    body.textContent = message.text;
  } else {
    const before = message.text.slice(0, start);
    const match = message.text.slice(start, start + message.annotation.original.length);
    const after = message.text.slice(start + message.annotation.original.length);

    body.append(document.createTextNode(before));
    body.append(buildAnnotation(message, match));
    body.append(document.createTextNode(after));
  }

  article.append(meta, body);
  return article;
}

function buildAnnotation(message, originalText) {
  const annotation = document.createElement("temporal-lens-annotation");
  annotation.dataset.anchor = message.annotation.anchor;
  annotation.dataset.confidence = message.annotation.confidence;
  annotation.dataset.original = originalText;
  annotation.dataset.postedAt = message.postedAt;
  annotation.dataset.targetIso = message.annotation.targetIso;
  return annotation;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
