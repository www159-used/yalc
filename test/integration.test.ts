import * as fs from "fs";
import * as path from "path";
import { describe, it } from "node:test";
import assert from "node:assert";
import type { IProblemProvider } from "../src/modules/interface/Problem";
import { LeetCodeProvider } from "../src/modules/LeetCode";
import { InternalApiProvider } from "../src/modules/InternalProvider";
import { generateTemplate } from "../src/modules/TemplateEngine";

const TEST_OUTPUT_DIR = path.join(__dirname, "..", "test-output");
const PROBLEM_ID = "392";

function getProvider(): IProblemProvider {
  const apiUrl = process.env.LEETCODE_TEST_API_URL?.trim();
  if (apiUrl) return new InternalApiProvider(apiUrl);
  return new LeetCodeProvider();
}

describe("Integration: fetch and create solution file", () => {
  it("fetches problem 392 from LeetCode and writes its official solution stub", async () => {
    const provider = getProvider();
    const problem = await provider.getProblem(PROBLEM_ID);

    assert.ok(
      problem,
      "Failed to fetch problem 392. LeetCode often blocks Node; set LEETCODE_TEST_API_URL to your internal API (e.g. GET {url}/problem/392 returns problem JSON) and run again."
    );
    assert.strictEqual(problem.id, PROBLEM_ID, "problem id should be 392");
    assert.ok(problem.title.length > 0, "problem should have title");
    if (!process.env.LEETCODE_TEST_API_URL?.trim()) {
      assert.strictEqual(problem.title, "判断子序列");
      assert.match(problem.codeSnippets?.rust ?? "", /impl Solution/);
      const rust = generateTemplate(problem, {language: "rust"});
      assert.match(rust, /impl Solution/);
      assert.match(rust, /pub fn is_subsequence/);
      assert.match(rust, /todo!\(\)/);
      assert.ok(!rust.includes("fn main"));
      assert.match(problem.translatedContent ?? "", /子序列/);
    }
    assert.ok(problem.codeSnippet.length > 0, "problem should have code snippet");

    const content = generateTemplate(problem);
    assert.ok(content.includes(`// ${PROBLEM_ID}.`), "template should include problem header");
    assert.ok(!content.includes("console.log("), "template should not include a local test driver");

    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    const filePath = path.join(TEST_OUTPUT_DIR, `${PROBLEM_ID}.ts`);
    fs.writeFileSync(filePath, content, "utf8");

    assert.ok(fs.existsSync(filePath), "file should exist on disk");

  });
});
