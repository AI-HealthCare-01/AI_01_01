import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("shared source file exists", () => {
  const indexPath = path.resolve("src/index.ts");
  assert.equal(fs.existsSync(indexPath), true);
});
