import { spawnSync } from 'node:child_process'
export interface RunResult { code: number }
export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): RunResult { const r = spawnSync(cmd, args, { cwd: opts.cwd, stdio: 'inherit', shell: false }); return { code: r.status ?? 1 } }
export function runShell(line: string, opts: { cwd?: string } = {}): RunResult { const r = spawnSync(line, { cwd: opts.cwd, stdio: 'inherit', shell: true }); return { code: r.status ?? 1 } }
export function spliceArgv(template: string[], cmd: string[]): string[] { const out: string[] = []; for (const el of template) { if (el === '{cmd...}') out.push(...cmd); else out.push(el) } return out }
export function isTTY(): boolean { return Boolean(process.stdout.isTTY && process.stdin.isTTY) }
