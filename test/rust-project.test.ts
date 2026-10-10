import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { syncRustProject, rustSnippetWithPlaceholders, stripRustLocalSupport, rustSourceWithLocalSupport } from '../src/modules/RustProject';

test('Rust placeholders fill empty functions without changing implementations', () => {
  assert.match(rustSnippetWithPlaceholders('impl Solution { pub fn answer() -> i32 {\n } }'), /todo!\(\)/);
  const source = 'impl Solution { pub fn answer() -> i32 { 42 } }';
  assert.equal(rustSnippetWithPlaceholders(source), source);
});

test('Rust project checks independent submissions and judge types while preserving submission code', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'leetcode-rust-test-'));
  try {
    const sources = {
      '13.rs': rustSnippetWithPlaceholders('impl Solution { pub fn answer() -> i32 {} }'),
      '42.rs': 'impl Solution { pub fn answer() -> i32 { 42 } } #[cfg(test)] mod tests { use super::*; #[test] fn answer_is_42() { assert_eq!(Solution::answer(), 42); } }',
      '2.rs': 'impl Solution { pub fn list() -> Option<Box<ListNode>> { Some(Box::new(ListNode::new(1))) } }',
      '100.rs': 'use std::rc::Rc; use std::cell::RefCell; impl Solution { pub fn tree() -> Option<Rc<RefCell<TreeNode>>> { Some(Rc::new(RefCell::new(TreeNode::new(1)))) } }',
      '380.rs': 'struct RandomizedSet; impl RandomizedSet { fn new() -> Self { Self } }',
      'custom.rs': 'struct Solution; impl Solution { pub fn answer() -> i32 { 0 } }',
    };
    const files = Object.keys(sources).map(name => path.join(root, name));
    for (const [name, source] of Object.entries(sources)) await fs.writeFile(path.join(root, name), source);
    const manifest = await syncRustProject(root, files);
    assert.equal(path.dirname(manifest), root, 'Cargo root must include solution files so RA creates valid test commands');
    execFileSync('cargo', ['check', '--offline', '--quiet', '--manifest-path', manifest], {stdio: 'pipe'});
    for (const [name, source] of Object.entries(sources)) assert.equal(stripRustLocalSupport(await fs.readFile(path.join(root, name), 'utf8')).trimEnd(), source.trimEnd());
    const tests = execFileSync('cargo', ['test', '--offline', '--quiet', '--manifest-path', manifest, 'answer_is_42'], {encoding: 'utf8'});
    assert.match(tests, /1 passed/);
    const judgeSource = path.join(root, 'judge.rs');
    await fs.writeFile(judgeSource, 'struct Solution;\n' + stripRustLocalSupport(await fs.readFile(files[1], 'utf8')));
    execFileSync('rustc', ['--crate-type', 'lib', '--edition', '2021', judgeSource, '-o', path.join(root, 'judge.rlib')], {stdio: 'pipe'});
    const library = path.join(root, '.leetcode-rust', 'modules.rs');
    assert.doesNotMatch(await fs.readFile(library, 'utf8'), /include!/);
    assert.match(await fs.readFile(library, 'utf8'), /#\[path =/);
    const before = (await fs.stat(library)).mtimeMs;
    await syncRustProject(root, files);
    assert.equal((await fs.stat(library)).mtimeMs, before, 'unchanged project must not trigger RA reloads');
    await fs.rename(files[1], path.join(root, 'renamed.rs'));
    await syncRustProject(root, [files[0], path.join(root, 'renamed.rs')]);
    execFileSync('cargo', ['check', '--offline', '--quiet', '--manifest-path', manifest], {stdio: 'pipe'});
    assert.ok(!(await fs.readFile(library, 'utf8')).includes('42.rs'));
    await fs.writeFile(library, '// user-owned file\n');
    await assert.rejects(syncRustProject(root, []), /Refusing to overwrite/);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});


test('local support is idempotent and strips out of submissions, retaining user tests', () => {
  const original = 'impl Solution { pub fn answer() -> i32 { 42 } }\n#[cfg(test)] mod tests { #[test] fn example() {} }\n';
  const prepared = rustSourceWithLocalSupport(original);
  assert.equal(rustSourceWithLocalSupport(prepared), prepared);
  assert.equal(stripRustLocalSupport(prepared), original);
  assert.match(prepared, /struct Solution/);
  assert.throws(() => stripRustLocalSupport(original + '// <leetcode-practice-local>'), /Incomplete/);
});
