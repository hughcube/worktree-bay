import { spawnSync, spawn } from 'node:child_process'
import { t } from '../i18n.js'
import { color as c } from './color.js'
export interface RunResult { code: number }
export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): RunResult { const r = spawnSync(cmd, args, { cwd: opts.cwd, stdio: 'inherit', shell: false }); return { code: r.status ?? 1 } }
export function runShell(line: string, opts: { cwd?: string } = {}): RunResult { const r = spawnSync(line, { cwd: opts.cwd, stdio: 'inherit', shell: true }); return { code: r.status ?? 1 } }
export function spliceArgv(template: string[], cmd: string[]): string[] { const out: string[] = []; for (const el of template) { if (el === '{cmd...}') out.push(...cmd); else out.push(el) } return out }
export function isTTY(): boolean { return Boolean(process.stdout.isTTY && process.stdin.isTTY) }

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
// 折叠式执行 setup/teardown 这类外部命令：TTY 下把输出收进单行临时进度（spinner + 秒数 + 最后一行），
// 成功收成「✓ label（Ns）」，失败才吐完整日志便于排查；非 TTY（CI/管道/MCP）原样透传保留完整日志。
export function runShellLive(line: string, opts: { cwd?: string }, label: string): Promise<RunResult> {
  if (!process.stderr.isTTY) {
    const r = spawnSync(line, { cwd: opts.cwd, stdio: 'inherit', shell: true })
    return Promise.resolve({ code: r.status ?? 1 })
  }
  return new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(line, { cwd: opts.cwd, shell: true })
    const buf: string[] = []; let last = ''; let fi = 0
    const render = () => {
      const secs = Math.floor((Date.now() - t0) / 1000)
      const head = `  ${c.cyan(SPIN[fi++ % SPIN.length])} ${label} ${c.dim(secs + 's')} `
      const room = Math.max(0, (process.stderr.columns || 80) - (`  x ${label} ${secs}s `).length - 1)
      process.stderr.write('\r\x1b[2K' + head + c.dim(last.slice(0, room)))
    }
    const timer = setInterval(render, 120)
    const onData = (d: Buffer) => {
      const s = d.toString(); buf.push(s)
      const lines = s.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
      if (lines.length) last = lines[lines.length - 1]
    }
    child.stdout?.on('data', onData); child.stderr?.on('data', onData)
    child.on('error', () => { clearInterval(timer); process.stderr.write('\r\x1b[2K'); resolve({ code: 1 }) })
    child.on('close', (code) => {
      clearInterval(timer)
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      process.stderr.write('\r\x1b[2K')
      if (code === 0) process.stderr.write(`  ${c.green('✓')} ${label}${c.dim(`（${secs}s）`)}\n`)
      else process.stderr.write(c.red(t(`  ✗ ${label} 失败（退出码 ${code}，${secs}s）↓`, `  ✗ ${label} failed (exit ${code}, ${secs}s) ↓`)) + '\n' + buf.join(''))
      resolve({ code: code ?? 1 })
    })
  })
}
