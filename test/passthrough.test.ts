import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { resolveRm, rmCommand } from '../src/commands/rm.js'
import { claim, slotOfFeature } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayrm-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 } } }; claim(cfg, 'f'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feature-x'), { recursive: true }) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('rm', () => {
  it('resolveRm 整槽列 occupant', () => { const t = resolveRm(cfg, 'f'); expect(t.map((o) => o.service)).toEqual(['api']); expect(t[0].slug).toBe('s1-feature-x') })
  it('down 整功能：空预约（有标签无 worktree）也释放标签', async () => {
    const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bayrm2-')); fs.mkdirSync(path.join(ws2, 'api'))
    const c2: BayConfig = { workspaceRoot: ws2, maxSlots: 9, configDir: ws2, services: { api: { port: 6001 } } }
    claim(c2, 'empty')   // 只占标签、不建 worktree
    expect(slotOfFeature(c2, 'empty')).toBe(1)
    await rmCommand(c2, 'empty', [], false)   // down empty（整功能）
    expect(slotOfFeature(c2, 'empty')).toBeUndefined()   // 标签已释放（修复前会被「未占用」早返回短路掉）
    fs.rmSync(ws2, { recursive: true, force: true })
  })
})
