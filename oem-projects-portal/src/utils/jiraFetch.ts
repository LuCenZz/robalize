import type { RawRow } from "../types";

const JIRA_STORAGE_KEY = "oem-jira-config";

export interface JiraConfig {
  email: string;
  apiToken: string;
  jql: string;
  maxRows: number;
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
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Atlassian-Token": "no-check",
  };

  // Step 1: Fetch all field definitions to build ID → name mapping
  const fieldsRes = await fetch("/jira-api/rest/api/3/field", { headers });
  if (!fieldsRes.ok) {
    const err = await fieldsRes.text();
    throw new Error(`Failed to fetch JIRA fields: ${fieldsRes.status} - ${err}`);
  }
  const fields: JiraField[] = await fieldsRes.json();
  const fieldMap = new Map<string, string>();
  for (const f of fields) {
    fieldMap.set(f.id, f.name);
  }

  // Step 2: Fetch issues in batches
  const allRows: RawRow[] = [];
  let startAt = 0;
  const batchSize = 100;
  let total = config.maxRows;

  while (startAt < total && startAt < config.maxRows) {
    const maxResults = Math.min(batchSize, config.maxRows - startAt);
    const searchRes = await fetch("/jira-api/rest/api/3/search", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jql: config.jql,
        startAt,
        maxResults,
        fields: ["*all"],
      }),
    });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      throw new Error(`JIRA search failed: ${searchRes.status} - ${err}`);
    }

    const data = await searchRes.json();
    total = Math.min(data.total, config.maxRows);

    for (const issue of data.issues as JiraIssue[]) {
      const row: RawRow = {};
      row["Issue key"] = issue.key;

      // Map all fields using human-readable names
      for (const [fieldId, value] of Object.entries(issue.fields)) {
        const fieldName = fieldMap.get(fieldId) || fieldId;
        row[fieldName] = formatFieldValue(value);
      }

      allRows.push(row);
    }

    startAt += data.issues.length;
    onProgress?.(Math.min(startAt, total), total);

    if (data.issues.length === 0) break;
  }

  return allRows;
}
