import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { parseConfig, loadConfig, repoPath, renderTemplate } from '../src/config.js'

let dir: string
function write(cfg: any) { const p = path.join(dir, 'worktree-bay.config.json'); fs.writeFileSync(p, JSON.stringify(cfg)); return p }
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baycfg-')); fs.mkdirSync(path.join(dir, 'api')); fs.mkdirSync(path.join(dir, 'lms')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))
const VALID = () => ({
  workspaceRoot: dir, maxSlots: 9,
  services: { api: { port: 6001, vars: { project: 'rqapi-{slug}' } }, lms: { port: 6011, upstream: { service: 'api', fallback: 'http://localhost:6001' } } }
})

describe('config', () => {
  it('合法配置通过 + configDir', () => { const c = parseConfig(write(VALID())); expect(c.services.api.port).toBe(6001) })
  it('V1 端口段重叠报错', () => { const v = VALID(); v.services.lms.port = 6005; expect(() => parseConfig(write(v))).toThrow(/端口段重叠|重叠/) })
  it('V2 port 非法报错', () => { const v: any = VALID(); delete v.services.lms.port; expect(() => parseConfig(write(v))).toThrow(/port/) })
  it('V3 upstream 不存在报错', () => { const v = VALID(); v.services.lms.upstream.service = 'ghost'; expect(() => parseConfig(write(v))).toThrow(/upstream/) })
  it('V5 repo 目录不存在报错', () => { const v: any = VALID(); v.services.pc = { port: 6021, repo: 'nope' }; expect(() => parseConfig(write(v))).toThrow(/repo|nope/) })
  it('repoPath 默认=服务名', () => { const c = parseConfig(write(VALID())); expect(repoPath(c, 'api')).toBe(path.join(dir, 'api')) })
  it('renderTemplate', () => { expect(renderTemplate('rqapi-{slug}', { slug: 's1-x' })).toBe('rqapi-s1-x') })
  it('V4 未知模板变量报错', () => {
    const v: any = VALID(); v.services.api.vars = { project: 'x-{ghostvar}' }
    expect(() => parseConfig(write(v))).toThrow(/template var|ghostvar/)
  })
  it('V4 引用基础变量或本服务 vars 通过', () => {
    const v: any = VALID(); v.services.api.vars = { project: 'rqapi-{slug}', alias: 'a-{project}' }
    expect(() => parseConfig(write(v))).not.toThrow()
  })
  it('loadConfig 自下而上找到配置', () => {
    fs.writeFileSync(path.join(dir, 'worktree-bay.config.json'), JSON.stringify(VALID()))
    const sub = path.join(dir, 'a', 'b'); fs.mkdirSync(sub, { recursive: true })
    // loadConfig 优先 WORKTREE_BAY_CONFIG 环境变量，测试时确保未设
    const saved = process.env.WORKTREE_BAY_CONFIG; delete process.env.WORKTREE_BAY_CONFIG
    try { expect(loadConfig(sub).services.api.port).toBe(6001) } finally { if (saved !== undefined) process.env.WORKTREE_BAY_CONFIG = saved }
  })
  it('workspaceRoot 非必选：省略时默认 config 所在目录', () => {
    const v: any = VALID(); delete v.workspaceRoot
    const c = parseConfig(write(v))
    expect(c.workspaceRoot).toBe(path.resolve(dir))
    expect(repoPath(c, 'api')).toBe(path.join(dir, 'api'))
  })
  it('workspaceRoot 相对路径：相对 config 目录解析', () => {
    const v: any = VALID(); v.workspaceRoot = '.'
    const c = parseConfig(write(v))
    expect(c.workspaceRoot).toBe(path.resolve(dir))
    expect(repoPath(c, 'api')).toBe(path.join(dir, 'api'))
  })
  it('workspaceRoot 相对路径：不受进程 cwd 影响', () => {
    const v: any = VALID(); v.workspaceRoot = '.'
    const p = write(v)
    const savedCwd = process.cwd(); const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'bayelse-'))
    try { process.chdir(elsewhere); const c = parseConfig(p); expect(repoPath(c, 'api')).toBe(path.join(dir, 'api')) }
    finally { process.chdir(savedCwd); fs.rmSync(elsewhere, { recursive: true, force: true }) }
  })
})
