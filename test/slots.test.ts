import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { scanOccupancy, freeSlot, claim, readLabels, pruneEmptyLabels } from '../src/slots.js'

let ws: string; let cfg: BayConfig
const wt = (repo: string, name: string) => fs.mkdirSync(path.join(ws, repo, '.worktrees', name), { recursive: true })
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayslot-')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 }, lms: { port: 6011 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('slots', () => {
  it('scanOccupancy 跨仓聚合', () => { wt('api', 's1-a'); wt('lms', 's1-a'); wt('api', 's3-b'); const o = scanOccupancy(cfg); expect(o.get(1)!.map((x) => x.service).sort()).toEqual(['api', 'lms']); expect(o.has(2)).toBe(false) })
  it('freeSlot 跳过占用与预约', () => { wt('api', 's1-x'); claim(cfg, 'r'); expect(freeSlot(cfg)).toBe(3) })
  it('claim 复用同名 + 写账本', () => { const n = claim(cfg, 'f'); expect(claim(cfg, 'f')).toBe(n); expect(readLabels(cfg)[String(n)]).toBe('f') })
  it('pruneEmptyLabels 报告"标签在无 worktree"', () => { claim(cfg, 'f'); expect(pruneEmptyLabels(cfg)).toEqual([{ slot: 1, feature: 'f' }]) })
})
