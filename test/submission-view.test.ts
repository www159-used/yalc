import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import ejs from 'ejs';
import { languageStrategyFromExtension, leetcodeApiLangFor } from '../src/modules/language/LanguageStrategy';

// Exercise the real webview handler in isolation from unrelated extension modules.
// Parse its AST so this harness does not duplicate the implementation.
const source = ts.createSourceFile('ProblemView.ts', fs.readFileSync('src/modules/ProblemView.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const handler = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'executeCode');
assert.ok(handler);
const js = ts.transpileModule(handler.getText(source), {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;

for (const scenario of ['accepted', 'wrong-answer', 'timeout', 'network-error', 'submit-failed', 'webview-focused', 'other-problem-active', 'closed-editor', 'missing-file', 'run-accepted', 'run-wrong', 'rust-submit', 'rust-run']) {
  test(`Submit UI replaces old sample result: ${scenario}`, async () => {
    const history: string[] = [];
    let rendered: any;
    const warnings: string[] = [];
    let html = 'You have passed the sample testcases';
    const panel = {reveal() {}, webview: {
      get html() { return html; },
      set html(value: string) { html = value; history.push(value); },
    }};
    const accepted = ['accepted', 'webview-focused', 'other-problem-active', 'closed-editor', 'run-accepted', 'rust-submit', 'rust-run'].includes(scenario);
    const action = (scenario.startsWith('run-') || scenario === 'rust-run') ? 'run' : 'submit';
    const filename = scenario.startsWith('rust-') ? '/practice/80.rs' : '/practice/80.py';
    const document = {fileName: filename, uri: {fsPath: filename}, getText: () => 'unsaved solution'};
    let submittedCode: string | undefined;
    const status = scenario === 'timeout' ? null : {status: accepted ? 'Accepted' : 'Wrong Answer', runSuccess: true, passedTestCaseCnt: 170, totalTestCaseCnt: 170, runtime: '3 ms', memory: '20.9 MB', runtimePercentile: 96.3599, memoryPercentile: 93.18909999999994, language: 'Python3'};
    const sandbox = {
      path,
      publicExampleInput: () => '[1,1,1,2,2,3]\n[0,0,1,1,1,1,2,3,3]',
      Database: {
        getSession: () => ({cookie: 'test'}),
        getSolutionPathSet: () => ({idPath: filename, slugPath: '/practice/remove-duplicates-from-sorted-array-ii.py'}),
        resolveSolutionFilePathForOpen: async () => ({path: '/practice/80.py', exists: scenario !== 'missing-file'}),
      },
      interviewSolutionBaseDir: () => undefined,
      interviewSolutionAttemptHex: () => undefined,
      getEffectiveChallengePanelLanguage: () => 'python',
      languageStrategyFromExtension,
      isDatabaseProblem: () => false,
      leetcodeApiLangFor,
      LeetCodeProvider: class {
        async submitCode(_slug: string, code: string, language: string) {
          assert.equal(language, scenario.startsWith('rust-') ? 'rust' : 'python3');
          submittedCode = code;
          if (scenario === 'network-error') throw new Error('offline');
          return scenario === 'submit-failed' ? null : {submissionId: 123};
        }
        async getSubmitStatus() { return status; }
        async runCode(_slug: string, code: string, language: string) { assert.equal(language, scenario.startsWith('rust-') ? 'rust' : 'python3'); submittedCode = code; return {interpretId: 'run-id'}; }
        async getRunStatus() { return { status: 10, correctAnswer: accepted, totalCorrect: accepted ? 2 : 1, totalTestcases: 2,
          testcaseResults: [{id: 0, status: true, stdout: '[1,1,2,2,3]', expectedOutput: '[1,1,2,2,3]'},
            {id: 1, status: accepted, stdout: accepted ? '[0,0,1,1,2,3,3]' : '[0,0,1]', expectedOutput: '[0,0,1,1,2,3,3]'}] }; }
      },
      problemViews: new Map([['remove-duplicates-from-sorted-array-ii', {testcasesPanel: panel}]]),
      renderTestcasesHtml: async (_: unknown, opts: any) => {
        rendered = opts;
        return ejs.renderFile('src/templates/run.ejs', { ...opts, testcaseResults: opts.testcaseResults ?? [] });
      },
      pollRunStatus: (read: () => unknown) => read(),
      pollSubmitStatus: (read: () => unknown) => read(),
      Logger: {log() {}, logError() {}},
      vscode: {
        ViewColumn: {Three: 3}, ProgressLocation: {Notification: 1},
        Uri: {file: (fsPath: string) => ({fsPath})},
        workspace: {
          textDocuments: ['closed-editor', 'missing-file'].includes(scenario) ? [] : [document],
          openTextDocument: async () => document,
        },
        window: {
          activeTextEditor: ['webview-focused', 'closed-editor', 'missing-file'].includes(scenario) ? undefined : {
            document: scenario === 'other-problem-active' ? {fileName: '/practice/27.py', uri: {fsPath: '/practice/27.py'}, getText: () => 'wrong problem'} : document,
          },
          visibleTextEditors: [],
          showWarningMessage(message: string) { warnings.push(message); },
          showInformationMessage() {}, showErrorMessage() {},
          withProgress: (_: unknown, run: () => unknown) => run(),
        },
      },
    };
    const run = vm.runInNewContext(`${js}\nexecuteCode`, sandbox);
    await run({}, {id: '80', titleSlug: 'remove-duplicates-from-sorted-array-ii'}, action);
    if (scenario === 'missing-file') {
      assert.equal(submittedCode, undefined);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /No solution file found for 80/);
      return;
    }
    assert.deepEqual(warnings, []);
    assert.match(history[0], action === 'run' ? /Running/ : /Submitting/);
    assert.match(history[0], /class="pending"/);
    assert.doesNotMatch(history[0], /Wrong answer/);
    assert.doesNotMatch(html, /sample testcases|Sample Test Case/);
    const result = rendered;
    assert.ok(html.includes(result.heading));
    assert.ok(html.includes(result.subheading));
    assert.equal(result.status, accepted);
    if (action === 'run') {
      assert.match(html, /运行用例 1/);
      assert.match(html, /运行用例 2/);
      assert.ok(html.includes('[0,0,1,1,2,3,3]'));
      assert.equal(result.status, accepted);
      return;
    }
    if (accepted) {
      assert.equal(submittedCode, 'unsaved solution');
      assert.match(html, /已通过全部 170 个测试用例/);
      for (const value of ['170 / 170', '3 ms', '20.9 MB', '96.36%', '93.19%', 'Python3', 'https://leetcode.cn/submissions/detail/123/']) {
        assert.ok(html.includes(value), `missing ${value}`);
      }
    }
    if (scenario === 'timeout') {
      assert.equal(result.heading, 'Submission result unavailable');
      assert.match(result.subheading, /123/);
    }
    if (scenario === 'network-error') assert.equal(result.heading, 'Submission result unavailable');
    if (scenario === 'submit-failed') assert.equal(result.heading, 'Submit failed');
  });
}


test('submission measurements preserve zero, omit missing values, and escape API text', async () => {
  const html = await ejs.renderFile('src/templates/run.ejs', {
    status: true, heading: 'Accepted', subheading: '已通过全部测试用例。', testcaseResults: [],
    submission: { id: 1, runtime: '0 ms', runtimePercentile: 0, memoryPercentile: null, language: '<script>alert(1)</script>' },
  });
  assert.match(html, /0 ms/);
  assert.match(html, /0\.00%/);
  assert.doesNotMatch(html, /内存占用|NaN|undefined|<script>/);
  assert.match(html, /&lt;script&gt;/);
});
