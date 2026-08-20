import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { saveFavorites, loadFavorites, loadUserPref, savePriorityColumns, loadPriorityColumns } =
  await import("../../public/lite/js/prefs.js");

test("prefs round-trip, namespaced by JIRA config email", () => {
  store.set("oem-jira-config", JSON.stringify({ email: "me@corp.com" }));
  saveFavorites(["Status", "Custom field (Product)"]);
  assert.ok(store.has("oem-prefs-me@corp.com:favorites"));
  assert.deepEqual(loadFavorites(), ["Status", "Custom field (Product)"]);
});

test("loadUserPref falls back when key is absent or JSON is broken", () => {
  assert.deepEqual(loadUserPref("nope", []), []);
  store.set("oem-prefs-me@corp.com:bad", "{not json");
  assert.equal(loadUserPref("bad", "fallback"), "fallback");
});

test("loadPriorityColumns defaults to Issue key + Summary until the user customizes it", () => {
  store.set("oem-jira-config", JSON.stringify({ email: "someone-else@corp.com" }));
  assert.deepEqual(loadPriorityColumns(), ["Issue key", "Summary"]);
  savePriorityColumns(["Issue key", "Summary", "Status"]);
  assert.deepEqual(loadPriorityColumns(), ["Issue key", "Summary", "Status"]);
});
