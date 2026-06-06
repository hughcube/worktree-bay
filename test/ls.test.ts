import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { renderSlots, slotsData } from '../src/commands/ls.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayls-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('ls', () => {
  it('列出 claim 槽 + 服务端口', () => { claim(cfg, 'feat-a'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feat-a'), { recursive: true }); const out = renderSlots(cfg); expect(out).toMatch(/slot 1/); expect(out).toMatch(/feat-a/); expect(out).toMatch(/6002/) })
  it('通用：非 api 服务不出现硬编码 "api="，显示真实服务名@端口，不再有 block=', () => {
    const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bayls2-')); fs.mkdirSync(path.join(ws2, 'web'))
    const c2: BayConfig = { workspaceRoot: ws2, maxSlots: 9, configDir: ws2, services: { web: { port: 6001 } } }
    claim(c2, 'f'); fs.mkdirSync(path.join(ws2, 'web', '.worktrees', 's1-f'), { recursive: true })
    const out = renderSlots(c2)
    expect(out).toMatch(/slot 1/); expect(out).toContain('web@6002'); expect(out).not.toContain('block='); expect(out).not.toContain('api=')
    fs.rmSync(ws2, { recursive: true, force: true })
  })
  it('slotsData 返回结构化数据（端口 + worktree 路径）', () => {
    claim(cfg, 'feat-a'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feat-a'), { recursive: true })
    const d = slotsData(cfg) as Array<{ feature: string; services: Array<{ service: string; port: number; dir: string }> }>
    expect(d[0].feature).toBe('feat-a')
    expect(d[0].services[0]).toMatchObject({ service: 'api', port: 6002 }); expect(d[0].services[0].dir).toContain('s1-feat-a')
  })
})
