import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTemplate } from '../src/modules/TemplateEngine';
import { publicExampleInput } from '../src/utils/exampleInput';
import type { Problem, SupportedLanguage } from '../src/modules/interface/Problem';

const problem: Problem = {
  id: '80', title: 'Remove Duplicates from Sorted Array II', titleSlug: 'remove-duplicates-from-sorted-array-ii', difficulty: 'Medium',
  codeSnippet: 'function removeDuplicates(nums: number[]): number {\n}',
  codeSnippets: {
    python3: 'class Solution:\n    def removeDuplicates(self, nums: list[int]) -> int:\n        pass',
    javascript: 'var removeDuplicates = function(nums) {};',
    java: 'class Solution { public int removeDuplicates(int[] nums) { return 0; } }',
    rust: 'impl Solution { pub fn removeDuplicates(nums: &mut Vec<i32>) -> i32 { todo!() } }',
    cpp: 'class Solution { public: int removeDuplicates(vector<int>& nums) { return 0; } };',
  },
  content: '<pre>Output: 5, nums = [1,1,2,2,3,_]</pre>',
  sampleTestCase: '[1,1,1,2,2,3]',
  exampleTestCases: ['[1,1,1,2,2,3]\n[0,0,1,1,1,1,2,3,3]'],
};

for (const language of ['python', 'typescript', 'javascript', 'java', 'cpp', 'rust'] as SupportedLanguage[]) {
  test(`${language}: creates a solution stub without local test drivers`, () => {
    const source = generateTemplate(problem, {language});
    assert.match(source, /removeDuplicates/);
    assert.match(source, /https:\/\/leetcode.cn\/problems\//);
    assert.doesNotMatch(source, /console\.log|print\(|System\.out|int main\(|static void main|_lcex_nums/);
    assert.doesNotMatch(source, /\[1,1,1,2,2,3\]/);
  });
}

test('Run on LeetCode uses all public examples, not just the first sample', () => {
  assert.equal(publicExampleInput(problem), '[1,1,1,2,2,3]\n[0,0,1,1,1,1,2,3,3]');
});
test('multi-argument examples retain case and argument order', () => {
  assert.equal(publicExampleInput({sampleTestCase: '[2,7]\n9', exampleTestCases: ['[2,7]\n9', '[3,3]\n6']}), '[2,7]\n9\n[3,3]\n6');
});
test('falls back to sample when the API has no public example list', () => {
  assert.equal(publicExampleInput({sampleTestCase: '[]', exampleTestCases: [' ']}), '[]');
});
