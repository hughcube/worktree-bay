import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { parseConfig, repoPath, renderTemplate } from '../src/config.js'

let dir: string
function write(cfg: any) { const p = path.join(dir, 'bay.config.json'); fs.writeFileSync(p, JSON.stringify(cfg)); return p }
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baycfg-')); fs.mkdirSync(path.join(dir, 'api')); fs.mkdirSync(path.join(dir, 'lms')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))
const VALID = () => ({
  workspaceRoot: dir, portBase: 6000, slotSpan: 10, maxSlots: 9,
  services: { api: { offset: 1, vars: { project: 'rqapi-{slug}' } }, lms: { offset: 2, upstream: { service: 'api', fallback: 'http://localhost:6001' } } }
})

describe('config', () => {
  it('合法配置通过 + configDir', () => { const c = parseConfig(write(VALID())); expect(c.services.api.offset).toBe(1) })
  it('V1 offset 重复报错', () => { const v = VALID(); v.services.lms.offset = 1; expect(() => parseConfig(write(v))).toThrow(/offset/) })
  it('V2 offset 越界报错', () => { const v = VALID(); v.services.lms.offset = 10; expect(() => parseConfig(write(v))).toThrow(/offset/) })
  it('V3 upstream 不存在报错', () => { const v = VALID(); v.services.lms.upstream.service = 'ghost'; expect(() => parseConfig(write(v))).toThrow(/upstream/) })
  it('V5 repo 目录不存在报错', () => { const v: any = VALID(); v.services.pc = { offset: 3, repo: 'nope' }; expect(() => parseConfig(write(v))).toThrow(/repo|nope/) })
  it('repoPath 默认=服务名', () => { const c = parseConfig(write(VALID())); expect(repoPath(c, 'api')).toBe(path.join(dir, 'api')) })
  it('renderTemplate', () => { expect(renderTemplate('rqapi-{slug}', { slug: 's1-x' })).toBe('rqapi-s1-x') })
})
