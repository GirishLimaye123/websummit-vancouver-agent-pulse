const { randomUUID } = require("node:crypto");

const allowedCamps = new Set(["maximalist", "roi", "danger", "architecture"]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

async function forwardToWebhook(record) {
  const webhookUrl = process.env.GOOGLE_APPS_SCRIPT_URL || process.env.RESPONSE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("Response received without storage webhook configured", record);
    return { stored: false, target: "log" };
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

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
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

    const storage = await forwardToWebhook(record);
    res.status(200).json({ ok: true, ...storage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "Could not save response." });
  }
};
