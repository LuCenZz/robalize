import type { ActiveFilter } from "../types";

const PREFIX = "oem-prefs-";

function key(email: string, name: string): string {
  return `${PREFIX}${email}:${name}`;
}

function getCurrentEmail(): string {
  try {
    const config = localStorage.getItem("oem-jira-config");
    if (config) return JSON.parse(config).email || "local";
  } catch { /* ignore */ }
  return "local";
}

export function saveUserPref(name: string, value: unknown, email?: string) {
  const e = email || getCurrentEmail();
  try {
    localStorage.setItem(key(e, name), JSON.stringify(value));
  } catch { /* quota */ }
}

export function loadUserPref<T>(name: string, fallback: T, email?: string): T {
  const e = email || getCurrentEmail();
  try {
    const stored = localStorage.getItem(key(e, name));
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

// Convenience functions for common prefs
export function saveFilters(filters: ActiveFilter[], email?: string) {
  saveUserPref("filters", filters, email);
}

export function loadFilters(email?: string): ActiveFilter[] {
  return loadUserPref<ActiveFilter[]>("filters", [], email);
}

export function saveFavorites(favorites: string[], email?: string) {
  saveUserPref("favorites", favorites, email);
}

export function loadFavorites(email?: string): string[] {
  return loadUserPref<string[]>("favorites", [], email);
}

export function saveSearchTerm(term: string, email?: string) {
  saveUserPref("search", term, email);
}

export function loadSearchTerm(email?: string): string {
  return loadUserPref<string>("search", "", email);
}
