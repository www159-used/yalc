import { describe, it } from "node:test";
import assert from "node:assert";
import { javaEntryClassName, problemKeyFromSolutionFileBase, solutionFileBaseName } from "../src/modules/language/LanguageStrategy";

describe("Java solution file naming", () => {
  it("uses the same id/slug filenames for Java as other languages", () => {
    assert.strictEqual(solutionFileBaseName("java", "2"), "2");
    assert.strictEqual(solutionFileBaseName("java", "two-sum"), "two-sum");
    assert.strictEqual(solutionFileBaseName("java", "2", "-abc"), "2-abc");
    assert.strictEqual(solutionFileBaseName("typescript", "2"), "2");
    assert.strictEqual(solutionFileBaseName("python", "two-sum", "-abc"), "two-sum-abc");
  });

  it("maps file bases back to problem ids/slugs", () => {
    assert.strictEqual(problemKeyFromSolutionFileBase("LCexMain2"), "2");
    assert.strictEqual(problemKeyFromSolutionFileBase("LCexMain2_abc"), "2");
    assert.strictEqual(problemKeyFromSolutionFileBase("LCexMainTwoSum"), "two-sum");
    assert.strictEqual(problemKeyFromSolutionFileBase("2"), "2");
    assert.strictEqual(problemKeyFromSolutionFileBase("two-sum"), "two-sum");
  });

  it("builds valid Java class names", () => {
    for (const name of [javaEntryClassName("2"), javaEntryClassName("two-sum"), javaEntryClassName("3sum")]) {
      assert.match(name, /^[A-Za-z_$][\w$]*$/, `${name} should be a valid Java identifier`);
    }
  });
});
