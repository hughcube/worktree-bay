import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { resolveRm } from '../src/commands/rm.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayrm-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 } } }; claim(cfg, 'f'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feature-x'), { recursive: true }) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('rm', () => { it('resolveRm 整槽列 occupant', () => { const t = resolveRm(cfg, 'f'); expect(t.map((o) => o.service)).toEqual(['api']); expect(t[0].slug).toBe('s1-feature-x') }) })
