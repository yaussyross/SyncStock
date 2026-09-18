import assert from "node:assert/strict";
import { clearedMappingIds } from "../src/lib/mapping-selection";

assert.deepEqual(clearedMappingIds(["1", "2"], ["1", "2"], { "1": "", "2": "qbo-2" }), ["1"]);
assert.deepEqual(clearedMappingIds(["1"], ["1"], { "1": "" }), ["1"], "last mapping can be removed");
assert.deepEqual(clearedMappingIds(["1"], ["1", "outside-page"], { "1": "" }), ["1"], "unloaded mappings must survive");
assert.deepEqual(clearedMappingIds(["1", "new"], ["1"], { "1": "replacement", "new": "" }), [], "replacement and unmapped variants are not deletions");
assert.deepEqual(clearedMappingIds(["1"], [], { "1": "" }), [], "saved removals are not submitted again");
console.log("Mapping removal regression checks passed.");
