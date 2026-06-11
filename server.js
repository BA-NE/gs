/**
 * Claude Usage Dashboard — Backend Proxy
 * 
 * Holds your Anthropic Analytics / Compliance / Admin key server-side so it
 * is never exposed to the browser.
 *
 * Setup:
 *   npm install express cors node-fetch
 *   ANTHROPIC_KEY=sk-ant-api01-... node server.js
 *
 * The dashboard (index.html) calls /api/* on this server.
 * This server forwards to api.anthropic.com and returns the result.
 */

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_KEY;

if (!API_KEY) {
  console.error("ERROR: ANTHROPIC_KEY environment variable is not set.");
  process.exit(1);
}

app.use(cors({ origin: "*" })); // tighten in production to your dashboard's origin
app.use(express.json());

// ─── Upstream base URLs ───────────────────────────────────────────────────────
const ANALYTICS_BASE  = "https://api.anthropic.com/v1/organizations/analytics";
const COMPLIANCE_BASE = "https://api.anthropic.com/v1/compliance";
const ADMIN_BASE      = "https://api.anthropic.com/v1/organizations";

// ─── Generic proxy helper ─────────────────────────────────────────────────────
async function proxy(upstreamUrl, req, res) {
  try {
    // Forward query string
    const url = new URL(upstreamUrl);
    for (const [k, v] of Object.entries(req.query)) {
      // Handle bracket-notation arrays: status[]=pending → status[]=pending
      url.searchParams.append(k, v);
    }

    const upstream = await fetch(url.toString(), {
      method: req.method,
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(502).json({ error: "upstream_error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS API  (read:analytics)
// ═══════════════════════════════════════════════════════════════════════════════

// Per-user activity for a single day
// GET /api/analytics/users?date=2026-06-01&limit=1000
app.get("/api/analytics/users", (req, res) =>
  proxy(`${ANALYTICS_BASE}/users`, req, res)
);

// Org-level DAU / WAU / MAU summary over a date range
// GET /api/analytics/summaries?starting_date=2026-05-01&ending_date=2026-06-01
app.get("/api/analytics/summaries", (req, res) =>
  proxy(`${ANALYTICS_BASE}/summaries`, req, res)
);

// Per-user USD cost report
// GET /api/analytics/user_cost_report?starting_at=...&ending_at=...&order_by=amount&limit=100
app.get("/api/analytics/user_cost_report", (req, res) =>
  proxy(`${ANALYTICS_BASE}/user_cost_report`, req, res)
);

// Per-user token usage report
// GET /api/analytics/user_usage_report?starting_at=...&ending_at=...&limit=100
app.get("/api/analytics/user_usage_report", (req, res) =>
  proxy(`${ANALYTICS_BASE}/user_usage_report`, req, res)
);

// Chat project usage
// GET /api/analytics/projects?date=2026-06-01
app.get("/api/analytics/projects", (req, res) =>
  proxy(`${ANALYTICS_BASE}/apps/chat/projects`, req, res)
);

// Skill usage
// GET /api/analytics/skills?date=2026-06-01
app.get("/api/analytics/skills", (req, res) =>
  proxy(`${ANALYTICS_BASE}/skills`, req, res)
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE API  (read:compliance_activities / org_data / user_data / org_settings)
// ═══════════════════════════════════════════════════════════════════════════════

// Activity feed — filter by type, actor, org, time window
// GET /api/compliance/activities?created_at.gte=...&created_at.lt=...&limit=5000
app.get("/api/compliance/activities", (req, res) =>
  proxy(`${COMPLIANCE_BASE}/activities`, req, res)
);

// List all orgs under the parent (read:compliance_org_data)
// GET /api/compliance/organizations
app.get("/api/compliance/organizations", (req, res) =>
  proxy(`${COMPLIANCE_BASE}/organizations`, req, res)
);

// List users in a specific org (read:compliance_user_data)
// GET /api/compliance/organizations/:orgUuid/users?limit=500
app.get("/api/compliance/organizations/:orgUuid/users", (req, res) =>
  proxy(`${COMPLIANCE_BASE}/organizations/${req.params.orgUuid}/users`, req, res)
);

// List groups (SCIM / RBAC) for an org — used to resolve #dept- groups
// GET /api/compliance/organizations/:orgUuid/groups
app.get("/api/compliance/organizations/:orgUuid/groups", (req, res) =>
  proxy(`${COMPLIANCE_BASE}/organizations/${req.params.orgUuid}/groups`, req, res)
);

// List group members
// GET /api/compliance/organizations/:orgUuid/groups/:groupId/members
app.get("/api/compliance/organizations/:orgUuid/groups/:groupId/members", (req, res) =>
  proxy(
    `${COMPLIANCE_BASE}/organizations/${req.params.orgUuid}/groups/${req.params.groupId}/members`,
    req, res
  )
);

// ═══════════════════════════════════════════════════════════════════════════════
// SPEND LIMITS API  (read:spend_limits)
// ═══════════════════════════════════════════════════════════════════════════════

// Every member's effective limit + period-to-date spend
// GET /api/spend_limits/effective?limit=1000
app.get("/api/spend_limits/effective", (req, res) =>
  proxy(`${ADMIN_BASE}/spend_limits/effective`, req, res)
);

// Single spend limit record
// GET /api/spend_limits/:id
app.get("/api/spend_limits/:id", (req, res) =>
  proxy(`${ADMIN_BASE}/spend_limits/${req.params.id}`, req, res)
);

// Spend limit increase requests queue
// GET /api/spend_limit_requests?status[]=pending
app.get("/api/spend_limit_requests", (req, res) =>
  proxy(`${ADMIN_BASE}/spend_limit_increase_requests`, req, res)
);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✓ Claude dashboard proxy running on http://localhost:${PORT}`);
  console.log(`  API key: ${API_KEY.slice(0, 18)}...`);
});
