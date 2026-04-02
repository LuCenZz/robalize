import type { RawRow } from "../types";

const JIRA_STORAGE_KEY = "oem-jira-config";

export interface JiraConfig {
  email: string;
  apiToken: string;
  jql: string;
  maxRows: number;
  refreshInterval: number; // seconds, 0 = disabled
}

export function loadJiraConfig(): JiraConfig | null {
  try {
    const stored = localStorage.getItem(JIRA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveJiraConfig(config: JiraConfig) {
  localStorage.setItem(JIRA_STORAGE_KEY, JSON.stringify(config));
}

interface JiraField {
  id: string;
  name: string;
  custom: boolean;
}

interface JiraIssue {
  key: string;
  fields: Record<string, unknown>;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Common JIRA object shapes
    if ("name" in obj && typeof obj.name === "string") return obj.name;
    if ("displayName" in obj && typeof obj.displayName === "string") return obj.displayName;
    if ("value" in obj && typeof obj.value === "string") return obj.value;
    if ("emailAddress" in obj && typeof obj.emailAddress === "string") return obj.emailAddress;
    if ("key" in obj && typeof obj.key === "string") return obj.key;
    return JSON.stringify(value);
  }
  return String(value);
}

export async function fetchJiraData(
  config: JiraConfig,
  onProgress?: (loaded: number, total: number) => void
): Promise<RawRow[]> {
  const auth = btoa(`${config.email}:${config.apiToken}`);

  async function jiraCall(path: string, method = "GET", body?: unknown) {
    // Use Vite proxy in dev, direct call won't work due to CORS
    const url = `/jira-proxy${path}`;
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

  // Step 1: Fetch all field definitions to build ID → name mapping
  const fields: JiraField[] = await jiraCall("/rest/api/3/field");
  const fieldMap = new Map<string, string>();
  for (const f of fields) {
    // Custom fields get "Custom field (...)" prefix to match CSV export format
    const name = f.custom ? `Custom field (${f.name})` : f.name;
    fieldMap.set(f.id, name);
  }

  // Step 2: Fetch issues using GET /search/jql via server proxy
  const allRows: RawRow[] = [];
  let nextPageToken: string | undefined;

  while (allRows.length < config.maxRows) {
    const maxR = Math.min(100, config.maxRows - allRows.length);
    const params = new URLSearchParams({
      jql: config.jql,
      maxResults: String(maxR),
      fields: "*all",
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);

    const data = await jiraCall(`/rest/api/3/search/jql?${params}`);
    console.log("JIRA response:", { keys: Object.keys(data), total: data.total, issueCount: data.issues?.length, isLast: data.isLast, nextPageToken: data.nextPageToken });

    const issues = (data.issues ?? []) as JiraIssue[];
    for (const issue of issues) {
      const row: RawRow = {};
      row["Issue key"] = issue.key;

      // Map all fields using human-readable names (matching CSV export format)
      const rawFields = issue.fields || {};
      for (const [fieldId, value] of Object.entries(rawFields)) {
        const fieldName = fieldMap.get(fieldId) || fieldId;
        row[fieldName] = formatFieldValue(value);
      }

      // Ensure standard fields match CSV column names
      row["Summary"] = formatFieldValue(rawFields.summary);
      row["Status"] = formatFieldValue(rawFields.status);
      row["Issue Type"] = formatFieldValue(rawFields.issuetype);

      // Parent mapping for initiative grouping
      const parent = rawFields.parent as Record<string, unknown> | undefined;
      if (parent) {
        row["Parent key"] = formatFieldValue(parent.key);
        row["Parent summary"] = formatFieldValue((parent.fields as Record<string, unknown>)?.summary);
      }

      allRows.push(row);
    }

    nextPageToken = data.nextPageToken;
    const isLastPage = data.isLast !== false;
    // Show real progress: if last page, total = what we have; otherwise estimate from loaded so far
    const estimatedTotal = isLastPage ? allRows.length : allRows.length + 100;
    onProgress?.(allRows.length, estimatedTotal);

    if (issues.length === 0 || isLastPage) break;
  }

  return allRows;
}
