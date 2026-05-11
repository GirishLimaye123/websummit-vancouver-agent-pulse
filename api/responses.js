const { randomUUID } = require("node:crypto");
const { get, list, put } = require("@vercel/blob");

const campIds = ["maximalist", "roi", "danger", "architecture"];
const allowedCamps = new Set(campIds);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function cleanText(value, maxLength = 1200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function validateAllocation(allocation) {
  if (!allocation || typeof allocation !== "object") return null;
  const cleaned = {};
  let total = 0;
  for (const key of allowedCamps) {
    const value = Number(allocation[key] || 0);
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    cleaned[key] = Math.round(value);
    total += cleaned[key];
  }
  return total === 100 ? cleaned : null;
}

async function saveToBlob(record) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  const day = record.receivedAt.slice(0, 10);
  const pathname = `responses/${day}/${record.id}.json`;
  const blob = await put(pathname, JSON.stringify(record, null, 2), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json"
  });

  return { stored: true, target: "vercel-blob", pathname, url: blob.url };
}

async function forwardToWebhook(record) {
  const webhookUrl = process.env.GOOGLE_APPS_SCRIPT_URL || process.env.RESPONSE_WEBHOOK_URL;
  if (!webhookUrl) {
    return null;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Webhook returned ${response.status}: ${body.slice(0, 300)}`);
  }

  return { stored: true, target: "webhook" };
}

async function storeRecord(record) {
  const blobStorage = await saveToBlob(record);
  const webhookStorage = await forwardToWebhook(record);

  if (blobStorage && webhookStorage) {
    return { stored: true, targets: [blobStorage.target, webhookStorage.target], blob: blobStorage };
  }

  if (blobStorage) return blobStorage;
  if (webhookStorage) return webhookStorage;

  console.log("Response received without storage configured", record);
  return { stored: false, target: "log" };
}

function emptyVotes() {
  return Object.fromEntries(campIds.map(id => [id, 0]));
}

async function recordFromBlob(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;

  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function aggregateResponses() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      responses: 0,
      votes: emptyVotes(),
      source: "log",
      updatedAt: new Date().toISOString()
    };
  }

  const votes = emptyVotes();
  let responses = 0;
  let scanned = 0;
  let skipped = 0;
  let cursor;

  do {
    const page = await list({ prefix: "responses/", limit: 1000, cursor });
    scanned += page.blobs.length;

    for (let i = 0; i < page.blobs.length; i += 25) {
      const chunk = page.blobs.slice(i, i + 25);
      await Promise.all(chunk.map(async blob => {
        try {
          const record = await recordFromBlob(blob.pathname);
          if (!record || !record.allocation || typeof record.allocation !== "object") {
            skipped += 1;
            return;
          }

          campIds.forEach(id => {
            const value = Math.round(Number(record.allocation[id] || 0));
            if (Number.isFinite(value) && value > 0) {
              votes[id] += value;
            }
          });
          responses += 1;
        } catch (error) {
          skipped += 1;
          console.error(`Could not aggregate ${blob.pathname}`, error);
        }
      }));
    }

    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return {
    responses,
    votes,
    source: "vercel-blob",
    updatedAt: new Date().toISOString(),
    scanned,
    skipped
  };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    try {
      const summary = await aggregateResponses();
      res.status(200).json({ ok: true, summary });
    } catch (error) {
      console.error(error);
      res.status(500).json({ ok: false, error: "Could not load tally." });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const camps = Array.isArray(body.camps) ? body.camps.filter(id => allowedCamps.has(id)) : [];
    const allocation = validateAllocation(body.allocation);

    if (!camps.length) {
      res.status(400).json({ ok: false, error: "At least one camp is required." });
      return;
    }

    if (!allocation) {
      res.status(400).json({ ok: false, error: "Allocation must total 100 chips." });
      return;
    }

    const record = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      clientCreatedAt: cleanText(body.createdAt, 80),
      camps,
      note: cleanText(body.note),
      allocation,
      userAgent: cleanText(req.headers["user-agent"], 300),
      source: "govai-field-question"
    };

    const storage = await storeRecord(record);
    const summary = await aggregateResponses();
    res.status(200).json({ ok: true, ...storage, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Could not save response." });
  }
};
