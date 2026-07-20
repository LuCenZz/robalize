// Port of src/utils/jiraFetch.ts. Same localStorage key and proxy endpoints
// as the existing app so both versions share config and cache.

const JIRA_STORAGE_KEY = "oem-jira-config";

export const DEFAULT_JQL = 'project = ACTO AND "product[dropdown]" IN (iCar, ICOM, Interfaces, Datacar, "Eris Motors", "Kobra II DMS", Ecaros, Drive, Serauto) AND status NOT IN (Ceased, Done) AND type in (Epic, Initiative) AND "type of task[dropdown]" = Projects ORDER BY cf[10015] ASC';

// Empty credentials → the server-side proxy injects its own (env vars).
export const DEFAULT_CONFIG = {
  email: "",
  apiToken: "",
  jql: DEFAULT_JQL,
  maxRows: 5000,
  refreshInterval: 0,
};

export function loadJiraConfig() {
  try {
    const stored = localStorage.getItem(JIRA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveJiraConfig(config) {
  localStorage.setItem(JIRA_STORAGE_KEY, JSON.stringify(config));
}

// Fetched once per session (cached) from /api/config, backed by the
// JIRA_DEFAULT_JQL Vercel env var — lets the org-wide default query change
// without a code deploy, while each visitor's own saved JQL still wins.
let serverDefaultJqlPromise = null;

function getServerDefaultJql() {
  if (!serverDefaultJqlPromise) {
    serverDefaultJqlPromise = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.jql || null)
      .catch(() => null);
  }
  return serverDefaultJqlPromise;
}

/**
 * The JIRA config to use: the visitor's own saved JQL if they've set one,
 * otherwise the server-managed default, otherwise the hardcoded fallback.
 * Other fields (email/apiToken/maxRows/refreshInterval) come from the
 * saved config when present, DEFAULT_CONFIG otherwise.
 */
export async function resolveJiraConfig() {
  const saved = loadJiraConfig() || {};
  const jql = saved.jql || (await getServerDefaultJql()) || DEFAULT_JQL;
  return { ...DEFAULT_CONFIG, ...saved, jql };
}

export function formatFieldValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const obj = value;
    if ("name" in obj && typeof obj.name === "string") return obj.name;
    if ("displayName" in obj && typeof obj.displayName === "string") return obj.displayName;
    if ("value" in obj && typeof obj.value === "string") return obj.value;
    if ("emailAddress" in obj && typeof obj.emailAddress === "string") return obj.emailAddress;
    if ("key" in obj && typeof obj.key === "string") return obj.key;
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * @param onProgress (loaded, total) => void — for a progress bar/text.
 * @param onBatch (rowsSoFar) => void — called after each page (~100 rows)
 *   so the caller can render partial results while the rest keeps loading
 *   in the background, instead of waiting for the whole fetch to finish.
 */
export async function fetchJiraData(config, onProgress, onBatch) {
  // Without local credentials, the proxy falls back to its server-side ones.
  const auth = config.email && config.apiToken ? btoa(`${config.email}:${config.apiToken}`) : null;

  async function jiraCall(path, method = "GET", body) {
    const url = `/api/jira-proxy${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        ...(auth ? { "Authorization": `Basic ${auth}` } : {}),
        "Accept": "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`JIRA ${method} ${path} failed: ${res.status} - ${err}`);
    }
    return res.json();
  }

  const fields = await jiraCall("/rest/api/3/field");
  const fieldMap = new Map();
  for (const f of fields) {
    const name = f.custom ? `Custom field (${f.name})` : f.name;
    fieldMap.set(f.id, name);
  }

  const allRows = [];
  let nextPageToken;

  while (allRows.length < config.maxRows) {
    const maxR = Math.min(100, config.maxRows - allRows.length);
    const params = new URLSearchParams({
      jql: config.jql,
      maxResults: String(maxR),
      fields: "*all",
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const data = await jiraCall(`/rest/api/3/search/jql?${params}`);

    const issues = data.issues ?? [];
    for (const issue of issues) {
      const row = {};
      row["Issue key"] = issue.key;

      const rawFields = issue.fields || {};
      for (const [fieldId, value] of Object.entries(rawFields)) {
        const fieldName = fieldMap.get(fieldId) || fieldId;
        row[fieldName] = formatFieldValue(value);
      }

      row["Summary"] = formatFieldValue(rawFields.summary);
      row["Status"] = formatFieldValue(rawFields.status);
      row["Issue Type"] = formatFieldValue(rawFields.issuetype);

      const parent = rawFields.parent;
      if (parent) {
        row["Parent key"] = formatFieldValue(parent.key);
        row["Parent summary"] = formatFieldValue(parent.fields?.summary);
      }

      allRows.push(row);
    }

    nextPageToken = data.nextPageToken;
    const isLastPage = data.isLast !== false;
    const estimatedTotal = isLastPage ? allRows.length : allRows.length + 100;
    onProgress?.(allRows.length, estimatedTotal);
    if (allRows.length > 0) onBatch?.(allRows);

    if (issues.length === 0 || isLastPage) break;
  }

  return allRows;
}
