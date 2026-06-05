import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { renderSlots } from '../src/commands/ls.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayls-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('ls', () => {
  it('列出 claim 槽 + api 端口', () => { claim(cfg, 'feat-a'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feat-a'), { recursive: true }); const out = renderSlots(cfg); expect(out).toMatch(/slot 1/); expect(out).toMatch(/feat-a/); expect(out).toMatch(/6011/) })
})
