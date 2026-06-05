import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { withLock } from '../src/lock.js'

let ws: string
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baylk-')) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('lock', () => {
  it('串行化并发临界区（两次 push 不交错）', async () => {
    const order: number[] = []
    const job = (n: number) => withLock(ws, async () => { order.push(n); await new Promise((r) => setTimeout(r, 20)); order.push(n) })
    await Promise.all([job(1), job(2)])
    expect(order[0]).toBe(order[1]); expect(order[2]).toBe(order[3])
  })
  it('释放后锁目录删除', async () => { await withLock(ws, async () => {}); expect(fs.existsSync(path.join(ws, '.worktree-bay', 'lock'))).toBe(false) })
})
