import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { claim } from '../src/slots.js'
import { stopCommand, startCommand } from '../src/commands/lifecycle.js'

let ws: string; let cfg: BayConfig; let dir: string
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baylife-'))
  fs.mkdirSync(path.join(ws, 'svc'))
  // docker 风格 infra 服务：setup/stop 用 echo 写标记文件（cwd=worktree dir）验证钩子被跑
  cfg = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { svc: { port: 8001, setup: 'echo x > setup-ran', stop: 'echo x > stop-ran' } } }
  claim(cfg, 'feat')   // 槽 1
  dir = path.join(ws, 'svc', '.worktrees', 's1-feat'); fs.mkdirSync(dir, { recursive: true })
})
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('lifecycle (docker 风格 infra：setup/stop 钩子)', () => {
  it('stop 跑 stop 钩子；start 重跑 setup 恢复', async () => {
    await stopCommand(cfg, 'feat')
    expect(fs.existsSync(path.join(dir, 'stop-ran'))).toBe(true)
    await startCommand(cfg, 'feat')
    expect(fs.existsSync(path.join(dir, 'setup-ran'))).toBe(true)
  })
  it('既无 start 也无 stop 的服务被跳过，不报错', async () => {
    const c2: BayConfig = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { svc: { port: 8001 } } }
    await expect(stopCommand(c2, 'feat')).resolves.toBeUndefined()
    expect(fs.existsSync(path.join(dir, 'stop-ran'))).toBe(false)
  })
})
