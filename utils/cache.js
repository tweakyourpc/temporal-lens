const DB_NAME = "temporal-lens-cache";
const DB_VERSION = 1;
const STORE_NAME = "annotations";
const UPDATED_AT_INDEX = "updatedAt";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10_000;

export async function buildMessageCacheKey(messageText, postedAt) {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${messageText}\u241f${postedAt}`),
  );

  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCacheEntries(keys) {
  if (!keys.length) {
    return new Map();
  }

  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const now = Date.now();
  const results = new Map();

  for (const key of keys) {
    const entry = await requestAsPromise(store.get(key));

    if (!entry) {
      continue;
    }

    if (entry.expiresAt <= now) {
      store.delete(key);
      continue;
    }

    results.set(key, entry.value);
  }

  await waitForTransaction(transaction);
  database.close();
  return results;
}

export async function putCacheEntries(entries) {
  if (!entries.length) {
    return;
  }

  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const now = Date.now();

  for (const entry of entries) {
    if (!entry?.key || !entry?.value) {
      continue;
    }

    store.put({
      key: entry.key,
      value: entry.value,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + TTL_MS,
    });
  }

  await waitForTransaction(transaction);
  database.close();
  await evictOverflow();
}

async function evictOverflow() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const count = await requestAsPromise(store.count());

  if (count <= MAX_ENTRIES) {
    await waitForTransaction(transaction);
    database.close();
    return;
  }

  let overflow = count - MAX_ENTRIES;
  const index = store.index(UPDATED_AT_INDEX);

  await new Promise((resolve, reject) => {
    const request = index.openCursor();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;

      if (!cursor || overflow <= 0) {
        resolve();
        return;
      }

      cursor.delete();
      overflow -= 1;
      cursor.continue();
    };
  });

  await waitForTransaction(transaction);
  database.close();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(STORE_NAME, { keyPath: "key" });
      store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX, { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
