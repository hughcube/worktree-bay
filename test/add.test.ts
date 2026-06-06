import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { resolveAdd } from '../src/commands/add.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayadd-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('add resolve', () => {
  it('解析槽/slug/目录/仓', () => { claim(cfg, 'f'); const r = resolveAdd(cfg, 'f', 'api', 'feature/x'); expect(r.slot).toBe(1); expect(r.slug).toBe('s1-feature-x'); expect(r.dir).toContain(path.join('api', '.worktrees', 's1-feature-x')) })
})
