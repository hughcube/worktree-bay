import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type { BayConfig } from '../src/config.js'
import { doctor } from '../src/commands/doctor.js'

let ws: string
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baydoc-')) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))
const cfg = (): BayConfig => ({ workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 } } })

describe('doctor', () => {
  it('服务仓是 git 仓 → 0 问题', () => { spawnSync('git', ['init', '-q', path.join(ws, 'api')]); expect(doctor(cfg())).toBe(0) })
  it('服务仓不是 git 仓 → 报问题', () => { fs.mkdirSync(path.join(ws, 'api')); expect(doctor(cfg())).toBeGreaterThan(0) })
})
