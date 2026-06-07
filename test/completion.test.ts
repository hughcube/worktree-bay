import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { complete, completionScript } from '../src/commands/completion.js'
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
  it('start/stop/restart 在子命令里且补 feature/service', () => {
    const subs = complete(cfg, ['bay']); for (const s of ['start', 'stop', 'restart']) expect(subs).toContain(s)
    expect(complete(cfg, ['bay', 'restart'])).toContain('drill')
    expect(complete(cfg, ['bay', 'stop', 'drill'])).toEqual(expect.arrayContaining(['api', 'lms']))
  })
  it('run 第四参补该服务的 run 命令名（无 run 则空）', () => {
    const c: BayConfig = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001, run: { test: ['echo'], migrate: ['echo'] } }, lms: { port: 6011 } } }
    expect(complete(c, ['bay', 'run', 'drill', 'api'])).toEqual(expect.arrayContaining(['test', 'migrate']))
    expect(complete(c, ['bay', 'run', 'drill', 'lms'])).toEqual([])
  })
  it('path 第二参补 feature、第三参补 service', () => {
    expect(complete(cfg, ['bay', 'path'])).toContain('drill')
    expect(complete(cfg, ['bay', 'path', 'drill'])).toEqual(expect.arrayContaining(['api', 'lms']))
  })
  it('无配置（cfg=null）仍补全子命令，但补不出 feature/service', () => {
    expect(complete(null, ['bay'])).toEqual(expect.arrayContaining(['up', 'add', 'down']))
    expect(complete(null, ['bay', 'add'])).toEqual([])
    expect(complete(null, ['bay', 'add', 'drill'])).toEqual([])
  })
  it('zsh 脚本用 ${(f)...} 按行分割候选（zsh 不做单词分割）', () => {
    expect(completionScript('zsh')).toContain('${(f)')
    expect(completionScript('zsh')).toContain('compdef _worktree_bay')
  })
  it('bash 脚本用 COMPREPLY 数组', () => expect(completionScript('bash')).toContain('COMPREPLY'))
})
