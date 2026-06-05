import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { initCommand } from '../src/commands/init.js'

let ws: string
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayinit-')) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('init', () => {
  it('扫描子 git 仓生成配置', () => {
    fs.mkdirSync(path.join(ws, 'api', '.git'), { recursive: true })
    fs.mkdirSync(path.join(ws, 'web', '.git'), { recursive: true })
    initCommand(ws)
    const cfg = JSON.parse(fs.readFileSync(path.join(ws, 'worktree-bay.config.json'), 'utf8'))
    expect(Object.keys(cfg.services).sort()).toEqual(['api', 'web'])
    expect(cfg.services.web.offset).not.toBe(cfg.services.api.offset)
  })
  it('无子仓时写 api/web 示例模板', () => {
    initCommand(ws)
    const cfg = JSON.parse(fs.readFileSync(path.join(ws, 'worktree-bay.config.json'), 'utf8'))
    expect(cfg.services.web.upstream.service).toBe('api')
  })
  it('已存在则不覆盖', () => {
    fs.writeFileSync(path.join(ws, 'worktree-bay.config.json'), '{"keep":1}')
    initCommand(ws)
    expect(fs.readFileSync(path.join(ws, 'worktree-bay.config.json'), 'utf8')).toContain('keep')
  })
})
