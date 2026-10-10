import * as vscode from "vscode";
import * as path from "path";
import { RUST_PROJECT_DIR, syncRustProject } from "./RustProject";
import * as Logger from "./Logger";

const queues = new Map<string, Promise<void>>();
const EXCLUDE = "**/{.git,node_modules,target,.leetcode-rust}/**";

async function syncFolder(folder: vscode.WorkspaceFolder): Promise<void> {
  try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ".leetcode")); }
  catch { return; }
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.rs"), EXCLUDE);
  const solutions: string[] = [];
  for (const uri of files) {
    const source = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    if (/https:\/\/leetcode\.(?:cn|com)\/problems\//.test(source)) solutions.push(uri.fsPath);
  }
  if (!solutions.length) {
    try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, RUST_PROJECT_DIR, "modules.rs")); }
    catch { return; }
  }
  // Never rewrite generated support into a file with unsaved user edits.
  if (vscode.workspace.textDocuments.some(doc => doc.isDirty && solutions.includes(doc.uri.fsPath))) return;
  const manifest = await syncRustProject(folder.uri.fsPath, solutions);
  const config = vscode.workspace.getConfiguration("rust-analyzer", folder.uri);
  const previous = config.get<unknown[]>("linkedProjects") ?? [];
  const legacy = path.join(folder.uri.fsPath, RUST_PROJECT_DIR, "Cargo.toml");
  const linked = previous.filter(entry => typeof entry !== "string" || path.resolve(folder.uri.fsPath, entry) !== legacy);
  const relative = path.relative(folder.uri.fsPath, manifest).split(path.sep).join("/");
  if (linked.some(entry => typeof entry === "string" && path.resolve(folder.uri.fsPath, entry) === manifest)) {
    if (linked.length !== previous.length) await config.update("linkedProjects", linked, vscode.ConfigurationTarget.WorkspaceFolder);
    return;
  }
  const projects = [...linked];
  if (!projects.length) {
    // Explicit linkedProjects disables discovery; preserve existing Cargo projects.
    const existing = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/{Cargo.toml,rust-project.json}"), EXCLUDE);
    projects.push(...existing.map(uri => path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join("/")));
  }
  if (!projects.includes(relative)) projects.push(relative);
  await config.update("linkedProjects", projects, vscode.ConfigurationTarget.WorkspaceFolder);
}

export function ensureRustWorkspace(uri: vscode.Uri): Promise<void> {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder || folder.uri.scheme !== "file") return Promise.resolve();
  const key = folder.uri.toString();
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => syncFolder(folder));
  queues.set(key, next);
  return next;
}

export function registerRustWorkspaceSupport(context: vscode.ExtensionContext): void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const schedule = (uri: vscode.Uri) => {
    if (uri.fsPath.split(path.sep).some(part => [RUST_PROJECT_DIR, "target", "node_modules", ".git"].includes(part))) return;
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) return;
    const key = folder.uri.toString();
    clearTimeout(pending.get(key));
    pending.set(key, setTimeout(() => {
      pending.delete(key);
      void ensureRustWorkspace(folder.uri).catch(error => Logger.logError("Rust editor project setup failed", error));
    }, 200));
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.rs");
  context.subscriptions.push(watcher, watcher.onDidCreate(schedule), watcher.onDidChange(schedule), watcher.onDidDelete(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      for (const folder of vscode.workspace.workspaceFolders ?? []) schedule(folder.uri);
    }),
    {dispose: () => { for (const timer of pending.values()) clearTimeout(timer); pending.clear(); }});
  for (const folder of vscode.workspace.workspaceFolders ?? []) schedule(folder.uri);
}
