import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFieldValue } from "../../public/lite/js/jira.js";

test("formatFieldValue flattens JIRA field shapes like the CSV export", () => {
  assert.equal(formatFieldValue(null), "");
  assert.equal(formatFieldValue(undefined), "");
  assert.equal(formatFieldValue("plain"), "plain");
  assert.equal(formatFieldValue(42), "42");
  assert.equal(formatFieldValue(true), "true");
  assert.equal(formatFieldValue({ name: "Status name" }), "Status name");
  assert.equal(formatFieldValue({ displayName: "Jane" }), "Jane");
  assert.equal(formatFieldValue({ value: "Option A" }), "Option A");
  assert.equal(formatFieldValue({ emailAddress: "a@b.c" }), "a@b.c");
  assert.equal(formatFieldValue({ key: "ACTO-1" }), "ACTO-1");
  assert.equal(formatFieldValue([{ name: "X" }, "", { name: "Y" }]), "X, Y");
  assert.equal(formatFieldValue({ other: 1 }), '{"other":1}');
});
