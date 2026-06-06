import { describe, it, expect } from 'vitest'
import { mergeEnvText, resolveUpstreamBase, buildVars, bringUp, type AddCtx } from '../src/engine.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

describe('engine pure', () => {
  it('mergeEnvText 覆盖/追加/保留', () => { const o = mergeEnvText('A=1\nB=2\n', { A: '9', C: '3' }); expect(o).toContain('A=9'); expect(o).not.toContain('A=1'); expect(o).toContain('B=2'); expect(o).toContain('C=3') })
  it('resolveUpstreamBase：materialized→本槽端口；否则 fallback', () => {
    const cfg: any = { services: { api: { port: 6001 } } }
    expect(resolveUpstreamBase(cfg, 1, { service: 'api', fallback: 'http://localhost:6001' }, true)).toBe('http://localhost:6002')
    expect(resolveUpstreamBase(cfg, 1, { service: 'api', fallback: 'http://localhost:6001' }, false)).toBe('http://localhost:6001')
  })
})

describe('buildVars', () => {
  it('串联端口/slug/upstream(materialized)/自定义 vars', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baybv-'))
    fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-x'), { recursive: true })   // 让 api 在槽1 materialized
    const cfg: any = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { api: { port: 6001 }, lms: { port: 6011, upstream: { service: 'api', fallback: 'http://localhost:6001' } } } }
    const sp = cfg.services.lms
    const vars = buildVars(cfg, { cfg, service: 'lms', sp, slot: 1, slug: 's1-y', dir: '/d', repo: '/r' })
    expect(vars.port).toBe(6012)
    expect(vars.upstreamBase).toBe('http://localhost:6002')   // api 在本槽 materialized
    fs.rmSync(ws, { recursive: true, force: true })
  })
})

describe('bringUp (无 docker：copy + env + 端口预检)', () => {
  it('建 worktree、拷文件、合并 env、跳过 setup', async () => {
    const g = (cwd: string, ...a: string[]) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' })
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baybu-'))
    const repo = path.join(ws, 'svc'); fs.mkdirSync(repo)
    spawnSync('git', ['init', '-q', repo]); g(repo, 'config', 'user.email', 't@t'); g(repo, 'config', 'user.name', 't')
    fs.writeFileSync(path.join(repo, '.env'), 'KEEP=1\n'); fs.writeFileSync(path.join(repo, 'f.txt'), 'hi')
    g(repo, 'add', '-A'); g(repo, 'commit', '-qm', 'init')
    const cfg: any = { workspaceRoot: ws, maxSlots: 9, configDir: ws, services: { svc: { port: 39001, copy: ['.env', 'f.txt'], env: { '.env': { PORT: '{port}' } } } } }
    const sp = cfg.services.svc
    const dir = path.join(repo, '.worktrees', 's1-feat')
    const ctxBase = { cfg, service: 'svc', sp, slot: 1, slug: 's1-feat', dir, repo }
    const ctx: AddCtx = { ...ctxBase, vars: buildVars(cfg, ctxBase) }
    await bringUp(ctx, 'HEAD', 'feat')
    expect(fs.existsSync(path.join(dir, 'f.txt'))).toBe(true)                       // copy 生效
    const env = fs.readFileSync(path.join(dir, '.env'), 'utf8')
    expect(env).toContain('KEEP=1'); expect(env).toContain('PORT=39002')           // env 合并保留+注入
    fs.rmSync(ws, { recursive: true, force: true })
  })
})
