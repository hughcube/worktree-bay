import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { logsCommand } from '../src/commands/logs.js'
import { logPath } from '../src/proc.js'

let ws: string
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baylogs-')) })
afterEach(() => { try { fs.rmSync(ws, { recursive: true, force: true, maxRetries: 3 }) } catch { /* 忽略 */ } })

function cap(fn: () => void): string {
  const out: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { out.push(a.map(String).join(' ')) })
  try { fn() } finally { spy.mockRestore() }
  return out.join('\n')
}
function seed(slug: string, service: string, body: string) {
  const lf = logPath(ws, slug, service); fs.mkdirSync(path.dirname(lf), { recursive: true }); fs.writeFileSync(lf, body); return lf
}
function occupy(feature: string, slot: number, service: string) {
  fs.mkdirSync(path.join(ws, service, '.worktrees', `s${slot}-${feature}`), { recursive: true })
  fs.writeFileSync(path.join(ws, '.worktree-bay-slots.json'), JSON.stringify({ [String(slot)]: feature }))
}
const cfg = (): any => ({ workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { web: { port: 6011, start: 'pnpm dev' }, api: { port: 6001 } } })

describe('logs 命令', () => {
  it('打印占槽功能的 dev server 日志尾部（含服务名）', () => {
    occupy('feat', 1, 'web'); seed('s1-feat', 'web', 'noise\nHELLO-LOG-TAIL\n')
    const o = cap(() => logsCommand(cfg(), 'feat'))
    expect(o).toContain('web'); expect(o).toContain('HELLO-LOG-TAIL')
  })
  it('--prev 读上一轮日志（.prev），不读当前轮', () => {
    occupy('feat', 1, 'web'); seed('s1-feat', 'web', 'current-run')
    fs.writeFileSync(logPath(ws, 's1-feat', 'web') + '.prev', 'PREVIOUS-RUN-LOG')
    const o = cap(() => logsCommand(cfg(), 'feat', [], { prev: true }))
    expect(o).toContain('PREVIOUS-RUN-LOG'); expect(o).not.toContain('current-run')
  })
  it('未占槽 → 友好提示，不抛错', () => {
    expect(cap(() => logsCommand(cfg(), 'nope'))).toMatch(/未占槽|no slot/)
  })
  it('未知服务名 → 抛错（与其它命令一致）', () => {
    expect(() => logsCommand(cfg(), 'feat', ['ghost'])).toThrow(/ghost/)
  })
})
