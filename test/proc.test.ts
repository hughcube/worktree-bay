import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { startDetached, stopManaged, recordedFor, pidAlive, readProcs, logPath } from '../src/proc.js'

let ws: string
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayproc-')) })
afterEach(() => { try { fs.rmSync(ws, { recursive: true, force: true, maxRetries: 3 }) } catch { /* 进程可能仍占用日志，忽略 */ } })

// 自终止进程，避免 kill 失败时泄漏（5s 后自己退）
const sleepCmd = `"${process.execPath}" -e "setTimeout(()=>{},5000)"`
async function deadWithin(pid: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) { if (!pidAlive(pid)) return true; await new Promise((r) => setTimeout(r, 50)) }
  return !pidAlive(pid)
}

describe('proc', () => {
  it('startDetached 登记+存活；stopManaged 停止+移除', async () => {
    const dir = path.join(ws, 'wt'); fs.mkdirSync(dir)
    const rec = startDetached(ws, dir, 'web', 's1-x', 6012, sleepCmd)
    expect(rec.pid).toBeGreaterThan(0)
    expect(recordedFor(ws, dir)?.pid).toBe(rec.pid)
    expect(fs.existsSync(rec.log)).toBe(true)
    await new Promise((r) => setTimeout(r, 200))
    expect(pidAlive(rec.pid)).toBe(true)
    stopManaged(ws, dir)
    expect(recordedFor(ws, dir)).toBeUndefined()         // 账本已移除
    expect(await deadWithin(rec.pid, 3000)).toBe(true)    // 进程已被杀
  })
  it('dir 规范化：账本存相对、按绝对查也命中（修复 console 被误判为外部进程的根因）', () => {
    const abs = path.join(ws, 'console', '.worktrees', 's1-mtest'); fs.mkdirSync(abs, { recursive: true })
    fs.mkdirSync(path.join(ws, '.worktree-bay'), { recursive: true })
    // 模拟历史/相对形态账本（停止侧给的是绝对路径，旧代码字符串直比会漏）
    fs.writeFileSync(path.join(ws, '.worktree-bay', 'processes.json'),
      JSON.stringify([{ dir: 'console/.worktrees/s1-mtest', service: 'console', port: 6022, pid: 999999, cmd: 'x', log: 'x', startedAt: 1 }]))
    expect(recordedFor(ws, abs)?.port).toBe(6022)
  })
  it('dir 规范化：相对/绝对两种形态都能匹配同一 worktree', () => {
    const abs = path.join(ws, 'svc', '.worktrees', 's1-x'); fs.mkdirSync(abs, { recursive: true })
    const rec = startDetached(ws, abs, 'svc', 's1-x', 6033, sleepCmd)
    expect(recordedFor(ws, 'svc/.worktrees/s1-x')?.pid).toBe(rec.pid)   // 相对形态查命中
    expect(recordedFor(ws, abs)?.pid).toBe(rec.pid)                      // 绝对形态查命中
    stopManaged(ws, 'svc/.worktrees/s1-x')                               // 相对形态也能停
    expect(recordedFor(ws, abs)).toBeUndefined()
  })
  it('logPath 单一来源（startDetached 写、logs 读同一路径）', () => {
    expect(logPath(ws, 's1-x', 'web')).toBe(path.join(ws, '.worktree-bay', 'logs', 's1-x-web.log'))
  })
  it('startDetached 写启动头；下一轮启动把上一轮滚动到 .prev', async () => {
    const dir = path.join(ws, 'wt-log'); fs.mkdirSync(dir)
    const rec1 = startDetached(ws, dir, 'web', 's3-log', 39101, sleepCmd)
    expect(fs.readFileSync(rec1.log, 'utf8')).toContain('worktree-bay start')     // 启动头标记本轮起点
    expect(fs.existsSync(rec1.log + '.prev')).toBe(false)                          // 首轮无 .prev
    await new Promise((r) => setTimeout(r, 100)); stopManaged(ws, dir)
    const rec2 = startDetached(ws, dir, 'web', 's3-log', 39101, sleepCmd)
    expect(fs.existsSync(rec2.log + '.prev')).toBe(true)                           // 上一轮被滚动保留
    stopManaged(ws, dir)
  })
  it('账本按 dir 唯一；readProcs 可读端口', () => {
    const dir = path.join(ws, 'wt2'); fs.mkdirSync(dir)
    startDetached(ws, dir, 'api', 's2-y', 7002, sleepCmd)
    expect(readProcs(ws).filter((r) => r.dir === dir)).toHaveLength(1)
    expect(readProcs(ws).find((r) => r.dir === dir)?.port).toBe(7002)
    startDetached(ws, dir, 'api', 's2-y', 7002, sleepCmd)   // 同 dir 重启 → 仍只一条
    expect(readProcs(ws).filter((r) => r.dir === dir)).toHaveLength(1)
    stopManaged(ws, dir)
  })
})
