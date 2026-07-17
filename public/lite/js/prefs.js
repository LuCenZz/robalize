// Port of src/utils/userPrefs.ts. Keys are shared with the existing app.

const PREFIX = "oem-prefs-";

function key(email, name) {
  return `${PREFIX}${email}:${name}`;
}

function getCurrentEmail() {
  try {
    const config = localStorage.getItem("oem-jira-config");
    if (config) return JSON.parse(config).email || "local";
  } catch { /* ignore */ }
  return "local";
}

export function saveUserPref(name, value, email) {
  const e = email || getCurrentEmail();
  try {
    localStorage.setItem(key(e, name), JSON.stringify(value));
  } catch { /* quota */ }
}

export function loadUserPref(name, fallback, email) {
  const e = email || getCurrentEmail();
  try {
    const stored = localStorage.getItem(key(e, name));
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function saveFilters(filters, email) { saveUserPref("filters", filters, email); }
export function loadFilters(email) { return loadUserPref("filters", [], email); }
export function saveFavorites(favorites, email) { saveUserPref("favorites", favorites, email); }
export function loadFavorites(email) { return loadUserPref("favorites", [], email); }
export function saveSearchTerm(term, email) { saveUserPref("search", term, email); }
export function loadSearchTerm(email) { return loadUserPref("search", "", email); }
