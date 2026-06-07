import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { startDetached, stopManaged, recordedFor, pidAlive, readProcs } from '../src/proc.js'

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
