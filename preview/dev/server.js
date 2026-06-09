import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const siteRoot = path.join(projectRoot, "preview", "site");
const args = parseArgs(process.argv.slice(2));
const host = args.host || process.env.HOST || "0.0.0.0";
const requestedPort = args.port || process.env.PORT;

if (!requestedPort) {
  console.error("Set PORT from Port Broker before starting preview. See README.md for the broker command.");
  process.exit(1);
}

const port = Number.parseInt(requestedPort, 10);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error("Invalid PORT: " + requestedPort);
  process.exit(1);
}

const startedAt = new Date().toISOString();
const service = "temporal-lens-preview";
const version = "0.1.0";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      sendJson(response, 400, { error: "Missing request URL." });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

    if (url.pathname === "/whoami") {
      sendJson(response, 200, {
        service,
        version,
        pid: process.pid,
        startedAt,
        host,
        port,
      });
      return;
    }

    if (url.pathname === "/api/demo-state") {
      sendJson(response, 200, buildDemoState());
      return;
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const candidatePath = resolveStaticPath(pathname);

    if (!candidatePath) {
      sendNotFound(response);
      return;
    }

    const fileStat = await stat(candidatePath);

    if (fileStat.isDirectory()) {
      sendNotFound(response);
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": contentTypeFor(candidatePath),
    });

    createReadStream(candidatePath).pipe(response);
  } catch (error) {
    console.error("Temporal Lens preview server error:", error);
    sendJson(response, 500, {
      error: "Internal server error.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, host, () => {
  console.log(`${service} listening on http://${host}:${port}`);
});

function resolveStaticPath(requestPath) {
  const siteCandidate = normalizePath(path.join(siteRoot, requestPath));
  const projectCandidate = normalizePath(path.join(projectRoot, requestPath));

  if (siteCandidate.startsWith(siteRoot) && existsSync(siteCandidate)) {
    return siteCandidate;
  }

  if (projectCandidate.startsWith(projectRoot) && existsSync(projectCandidate)) {
    return projectCandidate;
  }

  return null;
}

function normalizePath(candidatePath) {
  return path.normalize(candidatePath);
}

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "cache-control": "no-cache",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendNotFound(response) {
  sendJson(response, 404, { error: "Not found." });
}

function buildDemoState() {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  return {
    generatedAt: now.toISOString(),
    messages: [
      {
        platform: "discord",
        author: "Mia",
        postedAt: new Date(now.getTime() - 3 * day).toISOString(),
        text: "Can we ship this tomorrow morning?",
        annotation: {
          original: "tomorrow",
          anchor: "next_day",
          confidence: "high",
          targetIso: new Date(now.getTime() - 2 * day).toISOString(),
        },
      },
      {
        platform: "slack",
        author: "Noah",
        postedAt: new Date(now.getTime() - 9 * day).toISOString(),
        text: "Let's regroup next Friday after design review.",
        annotation: {
          original: "next Friday",
          anchor: "next_weekday:5",
          confidence: "high",
          targetIso: nextWeekday(new Date(now.getTime() - 9 * day), 5).toISOString(),
        },
      },
      {
        platform: "discord",
        author: "Ava",
        postedAt: new Date(now.getTime() - 14 * day).toISOString(),
        text: "The migration should land in a couple weeks.",
        annotation: {
          original: "a couple weeks",
          anchor: "in_2_weeks",
          confidence: "medium",
          targetIso: new Date(now.getTime()).toISOString(),
        },
      },
    ],
  };
}

function nextWeekday(reference, weekday) {
  const candidate = new Date(reference.getTime());

  do {
    candidate.setDate(candidate.getDate() + 1);
  } while (candidate.getDay() !== weekday);

  return candidate;
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--host" && argv[index + 1]) {
      parsed.host = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--port" && argv[index + 1]) {
      parsed.port = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}
