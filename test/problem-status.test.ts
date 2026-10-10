import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function functions(file: string, names: string[]): string {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text ?? ''))
    .map(s => ts.transpileModule(s.getText(source).replace(/^export /, ''), {
      compilerOptions: { target: ts.ScriptTarget.ES2020 }
    }).outputText).join('\n');
}

function harness() {
  const stored: Record<string, any> = {};
  const globalState = {
    get: (key: string) => stored[key],
    async update(key: string, value: unknown) {
      await new Promise(resolve => setTimeout(resolve, 5));
      stored[key] = value;
    }
  };
  let receive: (msg: any) => Promise<void>;
  let requests = 0;
  const webview = { html: 'unsolved', onDidReceiveMessage(fn: typeof receive) { receive = fn; } };
  const context = { globalState };
  const sandbox = vm.createContext({
    STATUS_KEY: 'status', context,
    problemViews: new Map([['rotate-array', {problem: {titleSlug: 'rotate-array'}, webviewPanel: {webview}}]]),
    getProblemTimer: () => undefined,
    trackAnalytics() {}, bucketDifficulty() {},
    Database: {isLoggedIn: () => false},
    renderChallengeHtml: async (_ctx: unknown, _problem: unknown, status: string) => status ?? 'unsolved',
    firePlainProblemDocumentChanged() {}, setCachedProblem() {},
    Logger: {logError() {}},
  });
  vm.runInContext(functions('src/modules/ProblemsProvider.ts', ['getRawEntry', 'getStoredStatus', 'setProblemStatus']) +
    functions('src/modules/ProblemView.ts', ['setupPanelMessageHandler', 'softReload', 'refreshProblemStatus']), sandbox);
  const options = {
    getProvider: () => ({getProblem: async () => { requests++; return null; }}),
    getProblemStatus: (slug: string) => sandbox.getStoredStatus(globalState, slug),
  };
  return {sandbox, context, options, webview, requests: () => requests, receive: (msg: any) => receive(msg)};
}

test('mark solved persists and refreshes the open statement without a network request', async () => {
  const h = harness();
  h.sandbox.setupPanelMessageHandler(h.context, 'rotate-array', h.options);
  await h.receive({event: 'markAsSolved', titleSlug: 'rotate-array'});
  assert.equal(h.webview.html, 'solved');
  assert.equal(h.options.getProblemStatus('rotate-array'), 'solved');
  assert.equal(h.requests(), 0);
});

test('sidebar mark solved refreshes the panel before optional solve bookkeeping finishes', async () => {
  const h = harness();
  let command: ts.CallExpression | undefined;
  const source = ts.createSourceFile('extension.ts', fs.readFileSync('src/extension.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.arguments[0]?.getText(source) === '"leetcode-practice.markAsSolved"') command = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(command);
  let treeRefreshed = false;
  Object.assign(h.sandbox, {
    globalState: h.context.globalState,
    getProvider: h.options.getProvider,
    refreshAllProblemViews() { treeRefreshed = true; },
    handleProblemSolved: () => new Promise(() => {}),
  });
  const js = ts.transpileModule(`const run = ${command.arguments[1].getText(source)};`, {
    compilerOptions: {target: ts.ScriptTarget.ES2020}
  }).outputText;
  vm.runInContext(js, h.sandbox);
  void vm.runInContext('run({item: {titleSlug: "rotate-array", difficulty: "Medium"}})', h.sandbox);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(treeRefreshed, true);
  assert.equal(h.webview.html, 'solved');
  assert.equal(h.requests(), 0);
});

for (const withCallback of [false, true]) {
  test(`solved status can be cleared and marked again offline (callback=${withCallback})`, async () => {
    const h = harness();
    let sidebarRefreshes = 0;
    const onClearStatus = withCallback ? async (slug: string) => {
      await h.sandbox.setProblemStatus(h.context.globalState, slug, undefined);
      sidebarRefreshes++;
    } : undefined;
    h.sandbox.setupPanelMessageHandler(h.context, 'rotate-array', {...h.options, onClearStatus});
    await h.receive({event: 'markAsSolved', titleSlug: 'rotate-array'});
    assert.equal(h.webview.html, 'solved');
    await h.receive({event: 'clearProblemStatus', titleSlug: 'rotate-array'});
    assert.equal(h.options.getProblemStatus('rotate-array'), undefined);
    assert.equal(h.webview.html, 'unsolved');
    assert.equal(sidebarRefreshes, withCallback ? 1 : 0);
    await h.receive({event: 'markAsSolved', titleSlug: 'rotate-array'});
    assert.equal(h.webview.html, 'solved');
    assert.equal(h.requests(), 0);
  });
}

test('statement offers the reverse action for each solved state', async () => {
  const {default: ejs} = await import('ejs');
  const template = fs.readFileSync('src/templates/challenge.ejs', 'utf8');
  for (const isSolved of [false, true]) {
    const html = ejs.render(template, {id: '42', title: '接雨水', titleSlug: 'trapping-rain-water',
      difficulty: 'Hard', isSolved, isLoggedIn: false, content: '<p>题面</p>'});
    assert.ok(html.includes('onclick="viewSolutions()"'));
    assert.ok(html.includes(isSolved ? 'onclick="clearProblemStatus()"' : 'onclick="markAsSolved()"'));
    assert.ok(!html.includes(isSolved ? 'onclick="markAsSolved()"' : 'onclick="clearProblemStatus()"'));
  }
});


test('view solutions opens the current problem on LeetCode without login or fetching', async () => {
  const h = harness();
  const urls: string[] = [];
  Object.assign(h.sandbox, {
    getInterviewSession: () => undefined,
    vscode: {Uri: {parse: (url: string) => url}, env: {openExternal: async (url: string) => {urls.push(url); return true;}}},
  });
  h.sandbox.setupPanelMessageHandler(h.context, 'rotate-array', h.options);
  await h.receive({event: 'viewSolutions', titleSlug: 'rotate-array'});
  assert.deepEqual(urls, ['https://leetcode.cn/problems/rotate-array/solutions/']);
  assert.equal(h.requests(), 0);
  h.sandbox.getInterviewSession = () => ({active: true});
  await h.receive({event: 'viewSolutions', titleSlug: 'rotate-array'});
  assert.equal(urls.length, 1);
});
