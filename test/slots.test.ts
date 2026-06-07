import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { scanOccupancy, freeSlot, claim, readLabels, readSlots, slotOfFeature, pruneEmptyLabels } from '../src/slots.js'

let ws: string; let cfg: BayConfig
const wt = (repo: string, name: string) => fs.mkdirSync(path.join(ws, repo, '.worktrees', name), { recursive: true })
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayslot-')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 }, lms: { port: 6011 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('slots', () => {
  it('scanOccupancy 跨仓聚合', () => { wt('api', 's1-a'); wt('lms', 's1-a'); wt('api', 's3-b'); const o = scanOccupancy(cfg); expect(o.get(1)!.map((x) => x.service).sort()).toEqual(['api', 'lms']); expect(o.has(2)).toBe(false) })
  it('freeSlot 跳过占用与预约', () => { wt('api', 's1-x'); claim(cfg, 'r'); expect(freeSlot(cfg)).toBe(3) })
  it('claim 复用同名 + 写账本', () => { const n = claim(cfg, 'f'); expect(claim(cfg, 'f')).toBe(n); expect(readLabels(cfg)[String(n)]).toBe('f') })
  it('pruneEmptyLabels 报告"标签在无 worktree"', () => { claim(cfg, 'f'); expect(pruneEmptyLabels(cfg)).toEqual([{ slot: 1, feature: 'f' }]) })
  it('claim 写入富元数据 branch/description/createdAt', () => {
    const n = claim(cfg, 'f', { branch: 'feat/x', description: '测 api+lms 回归' })
    const m = readSlots(cfg)[String(n)]
    expect(m.feature).toBe('f'); expect(m.branch).toBe('feat/x'); expect(m.description).toBe('测 api+lms 回归')
    expect(m.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
  it('claim 重入：更新非空 description、保留首次 createdAt', () => {
    const n = claim(cfg, 'f', { description: '旧介绍' }); const created = readSlots(cfg)[String(n)].createdAt
    expect(claim(cfg, 'f', { description: '新介绍' })).toBe(n)
    const m = readSlots(cfg)[String(n)]
    expect(m.description).toBe('新介绍'); expect(m.createdAt).toBe(created)
    expect(claim(cfg, 'f')).toBe(n); expect(readSlots(cfg)[String(n)].description).toBe('新介绍')   // 不传则不清空
  })
  it('readSlots 兼容旧字符串/旧对象/新数组三种格式；readLabels 仍返回字符串', () => {
    const fp = path.join(ws, '.worktree-bay-slots.json')
    fs.writeFileSync(fp, JSON.stringify({ '2': 'legacy' }))                                  // 最旧：纯字符串
    expect(readSlots(cfg)['2']).toEqual({ slot: 2, feature: 'legacy' })
    expect(readLabels(cfg)['2']).toBe('legacy'); expect(slotOfFeature(cfg, 'legacy')).toBe(2)
    fs.writeFileSync(fp, JSON.stringify({ '3': { feature: 'obj', description: 'd' } }))       // 旧：对象
    expect(readSlots(cfg)['3']).toEqual({ slot: 3, feature: 'obj', description: 'd' })
    fs.writeFileSync(fp, JSON.stringify([{ slot: 4, feature: 'arr', branch: 'b' }]))          // 新：数组
    expect(readSlots(cfg)['4']).toEqual({ slot: 4, feature: 'arr', branch: 'b' })
  })
  it('写盘为按槽号排序的数组', () => {
    claim(cfg, 'b'); claim(cfg, 'a')   // 依次占槽 1、2
    const raw = JSON.parse(fs.readFileSync(path.join(ws, '.worktree-bay-slots.json'), 'utf8'))
    expect(Array.isArray(raw)).toBe(true)
    expect(raw.map((r: { slot: number }) => r.slot)).toEqual([1, 2])
    expect(raw[0]).toMatchObject({ slot: 1, feature: 'b' }); expect(raw[0].createdAt).toBeTruthy()
  })
})
