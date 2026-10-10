import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { rustSourceWithLocalSupport } from '../src/modules/RustProject';
import { pollRunStatus, pollSubmitStatus } from '../src/utils/apiPoller';

// Bundle the real provider; only its VS Code output channel is replaced.
let provider: any;
before(async () => {
const bundle = await build({ entryPoints: ['src/modules/LeetCode.ts'], bundle: true,
  platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'logger', setup(b) {
    b.onResolve({ filter: /^\.\/Logger$/ }, () => ({ path: 'logger', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const log = () => {}; export const logError = () => {};' }));
  }}] });
const mod = { exports: {} as any };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(__filename), mod, mod.exports);
provider = new mod.exports.LeetCodeProvider();
});
const cookie = 'LEETCODE_SESSION=test; csrftoken=test';

test('completed CN submission replaces permanently pending check result', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/check/')) return Response.json({ state: 'PENDING' });
    assert.equal(String(url), 'https://leetcode.cn/graphql/');
    assert.match(String(init?.body), /submissionDetail/);
    return Response.json({ data: { submissionDetail: { statusDisplay: 'Accepted', passedTestCaseCnt: 170, totalTestCaseCnt: 170, runtime: '0 ms', memory: '20.9 MB', runtimePercentile: 100, memoryPercentile: 0, langVerboseName: 'Python3' } } });
  };
  try {
    const result = await pollSubmitStatus(() => provider.getSubmitStatus(751821115, cookie), {maxTries: 1, intervalMs: 0});
    assert.equal(result?.status, 'Accepted');
    assert.equal(result?.runSuccess, true);
    assert.equal(result?.passedTestCaseCnt, 170);
    assert.equal(result?.totalTestCaseCnt, 170);
    assert.equal(result?.runtime, '0 ms');
    assert.equal(result?.memory, '20.9 MB');
    assert.equal(result?.runtimePercentile, 100);
    assert.equal(result?.memoryPercentile, 0);
    assert.equal(result?.language, 'Python3');
  } finally { globalThis.fetch = original; }
});

test('Run status 10 is terminal Accepted', async () => {
  assert.equal((await pollRunStatus(async () => ({ status: 10 }), {maxTries: 1, intervalMs: 0}))?.status, 10);
});

for (const status of ['Wrong Answer', 'Compile Error', 'Runtime Error', 'Time Limit Exceeded', 'PENDING']) {
  test(`CN verdict: ${status}`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ data: { submissionDetail: { statusDisplay: status,
      outputDetail: { compileError: status === 'Compile Error' ? 'invalid syntax' : '', runtimeError: status === 'Runtime Error' ? 'division by zero' : '' } } } });
    try {
      const result = await pollSubmitStatus(() => provider.getSubmitStatus(1, cookie), {maxTries: 1, intervalMs: 0});
      if (status === 'PENDING') assert.equal(result, null);
      else { assert.equal(result?.status, status); assert.equal(result?.runSuccess, false); }
    } finally { globalThis.fetch = original; }
  });
}

test('Run waits for pending status, then returns Accepted', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => Response.json(++calls === 1 ? {state: 'STARTED'} : {status_code: 10});
  try {
    const result = await pollRunStatus(() => provider.getRunStatus('run-id', cookie), {maxTries: 2, intervalMs: 0});
    assert.equal(result?.status, 10);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

for (const payload of [{errors: [{message: 'unauthorized'}]}, {data: {submissionDetail: null}}]) {
  test(`no verdict is never accepted: ${JSON.stringify(payload)}`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json(payload);
    try {
      const result = await pollSubmitStatus(() => provider.getSubmitStatus(1, cookie), {maxTries: 1, intervalMs: 0});
      assert.equal(result, null);
    } finally { globalThis.fetch = original; }
  });
}

test('Run keeps per-case judge comparisons and ignores trailing answer sentinel', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({status_code: 10, correct_answer: false,
    total_correct: 1, total_testcases: 2, compare_result: '10',
    code_answer: ['[1,1,2,2,3]', '[0,0,1]', ''], expected_code_answer: ['[1,1,2,2,3]', '[0,0,1,1,2,3,3]', '']});
  try {
    const result = await pollRunStatus(() => provider.getRunStatus('run-id', cookie));
    assert.equal(result?.correctAnswer, false);
    assert.equal(result?.testcaseResults?.length, 2);
    assert.deepEqual(result?.testcaseResults?.map(r => r.status), [true, false]);
    assert.equal(result?.testcaseResults?.[1].expectedOutput, '[0,0,1,1,2,3,3]');
  } finally { globalThis.fetch = original; }
});

for (const translation of ['<p>给定一个数组，返回多数元素。</p>', null, '   ']) {
  test(`problem localization: ${JSON.stringify(translation)}`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const query = JSON.parse(String(init?.body)).query;
      assert.match(query, /translatedTitle/);
      assert.match(query, /translatedContent/);
      return Response.json({ data: { question: {
        questionId: '169', title: 'Majority Element', translatedTitle: translation ? '多数元素' : null,
        titleSlug: 'majority-element', difficulty: 'Easy', content: '<p>Given an array.</p>',
        translatedContent: translation, sampleTestCase: '[3,2,3]',
      } } });
    };
    try {
      const problem = await provider.getProblem('majority-element');
      assert.equal(problem.title, translation ? '多数元素' : 'Majority Element');
      assert.equal(problem.translatedContent, translation?.trim() || undefined);
      assert.equal(problem.content, '<p>Given an array.</p>', 'keep English for internal parsers');
      assert.equal(problem.titleSlug, 'majority-element');
      assert.equal(problem.sampleTestCase, '[3,2,3]');
    } finally { globalThis.fetch = original; }
  });
}

for (const action of ['run', 'submit']) {
  test(`Rust ${action} sends Rust code and language to LeetCode`, async () => {
    const original = globalThis.fetch;
    const code = 'impl Solution { pub fn is_subsequence(s: String, t: String) -> bool { true } }';
    let posted = false;
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith('/graphql/')) return Response.json({data: {question: {
        questionId: '392', title: 'Is Subsequence', titleSlug: 'is-subsequence',
        content: '', difficulty: 'Easy', sampleTestCase: '"abc"\n"ahbgdc"',
      }}});
      assert.ok(String(url).endsWith(action === 'run' ? '/interpret_solution/' : '/submit/'));
      assert.equal(body.lang, 'rust');
      assert.equal(body.typed_code.trimEnd(), code);
      assert.equal(body.question_id, '392');
      posted = true;
      return Response.json(action === 'run' ? {interpret_id: 'rust-run'} : {submission_id: 392});
    };
    try {
      const result = action === 'run'
        ? await provider.runCode('is-subsequence', rustSourceWithLocalSupport(code), 'rust', cookie)
        : await provider.submitCode('is-subsequence', rustSourceWithLocalSupport(code), 'rust', cookie);
      assert.ok(result);
      assert.ok(posted);
    } finally { globalThis.fetch = original; }
  });
}
