import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { complete } from '../src/commands/completion.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baycomp-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 }, lms: { port: 6011 } } }; claim(cfg, 'drill') })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('completion', () => {
  it('第一参补子命令（含 up/down）', () => { const s = complete(cfg, ['bay']); expect(s).toContain('add'); expect(s).toContain('up'); expect(s).toContain('down') })
  it('add 第二参补 feature', () => expect(complete(cfg, ['bay', 'add'])).toContain('drill'))
  it('add 第三参补 service', () => expect(complete(cfg, ['bay', 'add', 'drill'])).toEqual(expect.arrayContaining(['api', 'lms'])))
  it('up 第二参补 feature', () => expect(complete(cfg, ['bay', 'up'])).toContain('drill'))
  it('up 变长参补 service', () => { expect(complete(cfg, ['bay', 'up', 'drill'])).toEqual(expect.arrayContaining(['api', 'lms'])); expect(complete(cfg, ['bay', 'up', 'drill', 'api'])).toEqual(expect.arrayContaining(['api', 'lms'])) })
  it('down 第二参补 feature', () => expect(complete(cfg, ['bay', 'down'])).toContain('drill'))
})
