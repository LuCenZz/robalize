// Port of src/utils/jiraFetch.ts. Same localStorage key and proxy endpoints
// as the existing app so both versions share config and cache.

const JIRA_STORAGE_KEY = "oem-jira-config";

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

export async function fetchJiraData(config, onProgress) {
  const auth = btoa(`${config.email}:${config.apiToken}`);

  async function jiraCall(path, method = "GET", body) {
    const url = `/api/jira-proxy${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Basic ${auth}`,
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

    if (issues.length === 0 || isLastPage) break;
  }

  return allRows;
}
