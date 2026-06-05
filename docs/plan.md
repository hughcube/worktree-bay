# worktree-bay — 配置驱动的 worktree 槽位+端口编排器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现独立 Node/TS CLI `worktree-bay`，按"功能=槽位"模型在多子项目工作区并行开 worktree，用**通用声明式步骤引擎**（copy/env/upstream/setup/teardown/start/exec/run）驱动各服务，文件系统派生占用 + 合并感知回收，并发安全（工作区锁）。

**Architecture:** 独立仓 `~/Data/ms/worktree-bay`，读工作区外部配置 `worktree-bay.config.json`。纯逻辑模块（naming/ports/config/slots/template）可单测；副作用模块（lock/git/exec/engine）。无 docker/php 专用代码——领域命令全在配置。设计依据：同目录 spec `2026-06-05-worktree-slot-orchestration-design.md`（已两轮评审定稿，**以 spec 为准**）。

**Tech Stack:** Node ≥ 20, TypeScript, vitest, commander, tsx。仅 `node:` 内置。

---

## 全局约定（先读）

- **端口**：`blockBase = portBase + slot*slotSpan`；`portOf(slot, offset) = blockBase + offset`。槽 `N ∈ [1, maxSlots]`。
- **slug**：分支名归一化（非字母数字折 `-`、去首尾、小写、截断 ≤40）；worktree 目录名 `s<slot>-<slug>`，同槽碰撞追加短 hash。
- **占用真相**：扫各服务 `<repo>/.worktrees/s<N>-*`。`<ws>/.worktree-bay-slots.json` 仅"功能名→槽号"标签账本（预约）。
- **freeSlot**：1..maxSlots 中既不在占用、也不在标签的最小值。
- **并发**：`claim/add/rm/gc` 全程持 `<ws>/.worktree-bay/lock`（`mkdir` 原子锁）。
- **exec 安全**：`exec`/`run` 是 **argv 数组**，`{cmd...}` 是 argv splice（不字符串拼接）；setup/teardown/start 是 shell 字符串（用户自负）。所有命令**继承 stdio streaming**。
- **分支**：`worktree-bay add <feature> <service> <branch> [base]` → `git worktree add -b <branch> <dir> <base>`，base 默认 `origin/HEAD`。

测试放 `test/`，文件系统用 `mkdtemp` 临时夹具。

---

## M1：脚手架 + 配置(校验) + 端口 + 命名 + 槽位(锁) + claim/ls

### Task 1：脚手架仓库

**Files:** `~/Data/ms/worktree-bay/{package.json,tsconfig.json,vitest.config.ts,.gitignore,src/cli.ts}`

- [ ] **Step 1：建目录 + git init**

```bash
mkdir -p ~/Data/ms/worktree-bay/src ~/Data/ms/worktree-bay/test && cd ~/Data/ms/worktree-bay && git init -q && node -v
```
Expected: Node ≥ v20。

- [ ] **Step 2：`package.json`**

```json
{
  "name": "worktree-bay",
  "version": "0.1.0",
  "type": "module",
  "bin": { "worktree-bay": "dist/cli.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "dev": "tsx src/cli.ts", "test": "vitest run" },
  "dependencies": { "commander": "^12.1.0" },
  "devDependencies": { "@types/node": "^22.0.0", "tsx": "^4.19.0", "typescript": "^5.6.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 3：`tsconfig.json`**

```json
{
  "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "dist", "rootDir": "src", "strict": true, "skipLibCheck": true, "esModuleInterop": true },
  "include": ["src"]
}
```

- [ ] **Step 4：`vitest.config.ts` + `.gitignore`**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
```
`.gitignore`:
```
node_modules
dist
```

- [ ] **Step 5：占位 `src/cli.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander'
const program = new Command()
program.name('worktree-bay').description('worktree 槽位+端口编排器').version('0.1.0')
program.parseAsync(process.argv)
```

- [ ] **Step 6：装依赖 + 冒烟**

```bash
cd ~/Data/ms/worktree-bay && pnpm i && pnpm dev --help
```
Expected: 打印 help，无报错。

- [ ] **Step 7：Commit** `git add -A && git commit -m "chore: scaffold worktree-bay CLI"`

---

### Task 2：`naming.ts`

**Files:** `src/naming.ts`, `test/naming.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { slugify, worktreeDirName, parseWorktreeDir } from '../src/naming.js'

describe('naming', () => {
  it('slugify 归一化 + 截断', () => {
    expect(slugify('feature/Enroll-UI')).toBe('feature-enroll-ui')
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40)
  })
  it('worktreeDirName 烙槽号', () => { expect(worktreeDirName(2, 'feat-x')).toBe('s2-feat-x') })
  it('parseWorktreeDir', () => {
    expect(parseWorktreeDir('s2-feat-x')).toEqual({ slot: 2, slug: 'feat-x' })
    expect(parseWorktreeDir('nope')).toBeNull()
  })
})
```

- [ ] **Step 2：跑→FAIL** (`pnpm test naming`)

- [ ] **Step 3：实现**

```ts
export function slugify(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40).replace(/-+$/g, '')
}
export function worktreeDirName(slot: number, slug: string): string { return `s${slot}-${slug}` }
export function parseWorktreeDir(name: string): { slot: number; slug: string } | null {
  const m = /^s(\d+)-(.+)$/.exec(name)
  return m ? { slot: Number(m[1]), slug: m[2] } : null
}
```

- [ ] **Step 4：跑→PASS** · **Step 5：Commit** `feat: naming`

---

### Task 3：`ports.ts`

**Files:** `src/ports.ts`, `test/ports.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { blockBase, portOf, isPortFree } from '../src/ports.js'
import net from 'node:net'

describe('ports', () => {
  it('blockBase/portOf', () => {
    expect(blockBase(6000, 10, 1)).toBe(6010)
    expect(portOf(6000, 10, 1, 1)).toBe(6011)
    expect(portOf(6000, 10, 2, 4)).toBe(6024)
  })
  it('isPortFree=false 对已监听端口', async () => {
    const srv = net.createServer().listen(0, '127.0.0.1')
    await new Promise((r) => srv.once('listening', r))
    const port = (srv.address() as net.AddressInfo).port
    expect(await isPortFree(port)).toBe(false)
    srv.close()
  })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import net from 'node:net'
export function blockBase(portBase: number, slotSpan: number, slot: number): number { return portBase + slot * slotSpan }
export function portOf(portBase: number, slotSpan: number, slot: number, offset: number): number { return blockBase(portBase, slotSpan, slot) + offset }
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: port math + probe`

---

### Task 4：`config.ts`（含校验 V1–V5 + 模板插值）

**Files:** `src/config.ts`, `test/config.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { parseConfig, repoPath, renderTemplate } from '../src/config.js'

let dir: string
function write(cfg: any) { const p = path.join(dir, 'worktree-bay.config.json'); fs.writeFileSync(p, JSON.stringify(cfg)); return p }
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
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import fs from 'node:fs'
import path from 'node:path'

export interface Service { offset: number; repo?: string; vars?: Record<string, string>; copy?: string[]; env?: Record<string, Record<string, string>>; upstream?: { service: string; fallback: string }; setup?: string; teardown?: string; start?: string; exec?: string[]; run?: Record<string, string[]> }
export interface BayConfig { workspaceRoot: string; portBase: number; slotSpan: number; maxSlots: number; services: Record<string, Service>; configDir: string }

function refs(tpl: string): string[] { return [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) }

export function parseConfig(configPath: string): BayConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  for (const k of ['workspaceRoot', 'portBase', 'slotSpan', 'maxSlots']) if (raw[k] === undefined) throw new Error(`config: ${k} required`)
  const services: Record<string, Service> = raw.services ?? {}
  const offsets = new Set<number>()
  for (const [name, sp] of Object.entries<Service>(services)) {
    if (typeof sp.offset !== 'number') throw new Error(`config: ${name}.offset required`)
    if (sp.offset < 1 || sp.offset >= raw.slotSpan) throw new Error(`config: ${name}.offset must be 1..${raw.slotSpan - 1}`)  // V2
    if (offsets.has(sp.offset)) throw new Error(`config: duplicate offset ${sp.offset} (${name})`)                            // V1
    offsets.add(sp.offset)
    const repoDir = path.join(raw.workspaceRoot, sp.repo ?? name)
    if (!fs.existsSync(repoDir)) throw new Error(`config: ${name}.repo dir missing: ${repoDir}`)                               // V5
  }
  for (const [name, sp] of Object.entries<Service>(services)) if (sp.upstream && !services[sp.upstream.service]) throw new Error(`config: ${name}.upstream.service '${sp.upstream.service}' not found`)  // V3
  const known = new Set(['slot', 'blockBase', 'port', 'slug', 'worktree', 'repo', 'upstreamBase', 'cmd'])                      // V4
  for (const sp of Object.values(services)) for (const v of Object.values(sp.vars ?? {})) for (const ref of refs(v)) if (!known.has(ref) && !(sp.vars && ref in sp.vars)) throw new Error(`config: unknown template var {${ref}}`)
  return { workspaceRoot: raw.workspaceRoot, portBase: raw.portBase, slotSpan: raw.slotSpan, maxSlots: raw.maxSlots, services, configDir: path.dirname(configPath) }
}

export function loadConfig(startDir: string): BayConfig {
  if (process.env.WORKTREE_BAY_CONFIG) return parseConfig(process.env.WORKTREE_BAY_CONFIG)
  let dir = path.resolve(startDir)
  for (;;) { const p = path.join(dir, 'worktree-bay.config.json'); if (fs.existsSync(p)) return parseConfig(p); const parent = path.dirname(dir); if (parent === dir) throw new Error('worktree-bay.config.json not found'); dir = parent }
}

export function repoPath(cfg: BayConfig, service: string): string {
  const sp = cfg.services[service]; if (!sp) throw new Error('unknown service: ' + service)
  return path.join(cfg.workspaceRoot, sp.repo ?? service)
}
export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`))
}
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: config load + V1-V5 validation + template`

---

### Task 5：`lock.ts`（工作区原子锁，Codex#1）

**Files:** `src/lock.ts`, `test/lock.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { withLock } from '../src/lock.js'

let ws: string
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baylk-')) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('lock', () => {
  it('串行化并发临界区（两次 push 不交错）', async () => {
    const order: number[] = []
    const job = (n: number) => withLock(ws, async () => { order.push(n); await new Promise((r) => setTimeout(r, 20)); order.push(n) })
    await Promise.all([job(1), job(2)])
    expect(order[0]).toBe(order[1]); expect(order[2]).toBe(order[3])
  })
  it('释放后锁目录删除', async () => { await withLock(ws, async () => {}); expect(fs.existsSync(path.join(ws, '.worktree-bay', 'lock'))).toBe(false) })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import fs from 'node:fs'
import path from 'node:path'

export async function withLock<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(ws, '.worktree-bay', 'lock')
  fs.mkdirSync(path.join(ws, '.worktree-bay'), { recursive: true })
  const start = Date.now()
  for (;;) {
    try { fs.mkdirSync(lockDir); break }
    catch { if (Date.now() - start > 30000) throw new Error('worktree-bay: lock timeout (另一个 worktree-bay 在运行?)'); await new Promise((r) => setTimeout(r, 50)) }
  }
  try { return await fn() } finally { fs.rmdirSync(lockDir) }
}
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: workspace mkdir lock`

---

### Task 6：`slots.ts`（派生占用 + freeSlot + 标签 + 空预约报告）

**Files:** `src/slots.ts`, `test/slots.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { scanOccupancy, freeSlot, claim, readLabels, pruneEmptyLabels } from '../src/slots.js'

let ws: string; let cfg: BayConfig
const wt = (repo: string, name: string) => fs.mkdirSync(path.join(ws, repo, '.worktrees', name), { recursive: true })
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayslot-')); cfg = { workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 }, lms: { offset: 2 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('slots', () => {
  it('scanOccupancy 跨仓聚合', () => { wt('api', 's1-a'); wt('lms', 's1-a'); wt('api', 's3-b'); const o = scanOccupancy(cfg); expect(o.get(1)!.map((x) => x.service).sort()).toEqual(['api', 'lms']); expect(o.has(2)).toBe(false) })
  it('freeSlot 跳过占用与预约', () => { wt('api', 's1-x'); claim(cfg, 'r'); expect(freeSlot(cfg)).toBe(3) })
  it('claim 复用同名 + 写账本', () => { const n = claim(cfg, 'f'); expect(claim(cfg, 'f')).toBe(n); expect(readLabels(cfg)[String(n)]).toBe('f') })
  it('pruneEmptyLabels 报告"标签在无 worktree"', () => { claim(cfg, 'f'); expect(pruneEmptyLabels(cfg)).toEqual([{ slot: 1, feature: 'f' }]) })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { BayConfig, repoPath } from './config.js'
import { parseWorktreeDir } from './naming.js'

export interface Occupant { service: string; slot: number; slug: string; dir: string }
export function scanOccupancy(cfg: BayConfig): Map<number, Occupant[]> {
  const map = new Map<number, Occupant[]>()
  for (const service of Object.keys(cfg.services)) {
    const root = path.join(repoPath(cfg, service), '.worktrees'); if (!fs.existsSync(root)) continue
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = parseWorktreeDir(e.name); if (!p) continue
      const list = map.get(p.slot) ?? []; list.push({ service, slot: p.slot, slug: e.name, dir: path.join(root, e.name) }); map.set(p.slot, list)
    }
  }
  return map
}
function labelPath(cfg: BayConfig) { return path.join(cfg.workspaceRoot, '.worktree-bay-slots.json') }
export function readLabels(cfg: BayConfig): Record<string, string> { const p = labelPath(cfg); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {} }
function save(cfg: BayConfig, l: Record<string, string>) { fs.writeFileSync(labelPath(cfg), JSON.stringify(l, null, 2) + '\n') }
export function writeLabel(cfg: BayConfig, slot: number, f: string) { const l = readLabels(cfg); l[String(slot)] = f; save(cfg, l) }
export function removeLabel(cfg: BayConfig, slot: number) { const l = readLabels(cfg); delete l[String(slot)]; save(cfg, l) }
export function slotOfFeature(cfg: BayConfig, f: string): number | undefined { for (const [k, v] of Object.entries(readLabels(cfg))) if (v === f) return Number(k); return undefined }
export function freeSlot(cfg: BayConfig): number {
  const occ = scanOccupancy(cfg); const l = readLabels(cfg)
  for (let n = 1; n <= cfg.maxSlots; n++) if (!occ.has(n) && l[String(n)] === undefined) return n
  throw new Error(`no free slot (1..${cfg.maxSlots} all taken)`)
}
export function claim(cfg: BayConfig, f: string): number { const e = slotOfFeature(cfg, f); if (e !== undefined) return e; const n = freeSlot(cfg); writeLabel(cfg, n, f); return n }
export function pruneEmptyLabels(cfg: BayConfig): { slot: number; feature: string }[] {
  const occ = scanOccupancy(cfg); const removed: { slot: number; feature: string }[] = []
  for (const [k, v] of Object.entries(readLabels(cfg))) if (!occ.has(Number(k))) removed.push({ slot: Number(k), feature: v })
  return removed
}
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: slot occupancy + claim ledger + empty-label report`

---

### Task 7：`worktree-bay claim` / `worktree-bay ls` + cli

**Files:** `src/commands/{claim,ls}.ts`, `src/util/log.ts`, `src/cli.ts`, `test/ls.test.ts`

- [ ] **Step 1：`util/log.ts`**

```ts
export const log = (...a: unknown[]) => console.log(...a)
export const warn = (...a: unknown[]) => console.warn(...a)
export const die = (m: string): never => { console.error('worktree-bay: ' + m); process.exit(1) }
```

- [ ] **Step 2：失败测试（ls 纯渲染）**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { renderSlots } from '../src/commands/ls.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayls-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('ls', () => {
  it('列出 claim 槽 + api 端口', () => { claim(cfg, 'feat-a'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feat-a'), { recursive: true }); const out = renderSlots(cfg); expect(out).toMatch(/slot 1/); expect(out).toMatch(/feat-a/); expect(out).toMatch(/6011/) })
})
```

- [ ] **Step 3：FAIL**

- [ ] **Step 4：`commands/ls.ts`**

```ts
import { BayConfig } from '../config.js'
import { scanOccupancy, readLabels } from '../slots.js'
import { blockBase } from '../ports.js'
import { log } from '../util/log.js'

export function renderSlots(cfg: BayConfig): string {
  const occ = scanOccupancy(cfg); const labels = readLabels(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(labels).map(Number)])
  const lines: string[] = []
  for (const n of [...slots].sort((a, b) => a - b)) {
    const base = blockBase(cfg.portBase, cfg.slotSpan, n)
    const svc = (occ.get(n) ?? []).map((o) => `${o.service}@${base + cfg.services[o.service].offset}`)
    lines.push(`slot ${n}  ${labels[String(n)] ?? '(unnamed)'}  api=${base + 1}  [${svc.join(', ') || 'no worktree'}]`)
  }
  return lines.join('\n') || '(no slots in use)'
}
export function lsCommand(cfg: BayConfig) { log(renderSlots(cfg)) }
```

- [ ] **Step 5：`commands/claim.ts`**

```ts
import { BayConfig } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { blockBase } from '../ports.js'
import { log } from '../util/log.js'

export async function claimCommand(cfg: BayConfig, feature: string) {
  const slot = await withLock(cfg.workspaceRoot, async () => claim(cfg, feature))
  const base = blockBase(cfg.portBase, cfg.slotSpan, slot)
  log(`功能 "${feature}" → 槽 ${slot}（块 ${base}）`)
  for (const [n, sp] of Object.entries(cfg.services)) log(`  ${n.padEnd(8)} ${base + sp.offset}`)
}
```

- [ ] **Step 6：`cli.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig, BayConfig } from './config.js'
import { claimCommand } from './commands/claim.js'
import { lsCommand } from './commands/ls.js'
import { die } from './util/log.js'

const program = new Command()
program.name('worktree-bay').description('worktree 槽位+端口编排器').version('0.1.0')
const sync = (fn: (c: BayConfig) => void) => { try { fn(loadConfig(process.cwd())) } catch (e) { die((e as Error).message) } }

program.command('claim <feature>').action(async (f) => { try { await claimCommand(loadConfig(process.cwd()), f) } catch (e) { die((e as Error).message) } })
program.command('ls').action(() => sync(lsCommand))
program.parseAsync(process.argv)
```

- [ ] **Step 7：PASS + 冒烟** · **Step 8：Commit** `feat: worktree-bay claim + ls`

---

## M2：exec(argv) + git + 通用步骤引擎 + add/run/sh/rm

### Task 8：`util/exec.ts`（argv 执行 + streaming + splice + TTY，Codex#8/#17）

**Files:** `src/util/exec.ts`, `test/exec.test.ts`

- [ ] **Step 1：失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { run, spliceArgv } from '../src/util/exec.js'

describe('exec', () => {
  it('run 返回退出码', () => { expect(run('node', ['-e', 'process.exit(3)']).code).toBe(3) })
  it('spliceArgv 把 {cmd...} 替换为 argv（不字符串拼接）', () => { expect(spliceArgv(['docker', 'exec', 'c1', '{cmd...}'], ['php', 'artisan', 'migrate'])).toEqual(['docker', 'exec', 'c1', 'php', 'artisan', 'migrate']) })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import { spawnSync } from 'node:child_process'
export interface RunResult { code: number }
export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): RunResult { const r = spawnSync(cmd, args, { cwd: opts.cwd, stdio: 'inherit', shell: false }); return { code: r.status ?? 1 } }
export function runShell(line: string, opts: { cwd?: string } = {}): RunResult { const r = spawnSync(line, { cwd: opts.cwd, stdio: 'inherit', shell: true }); return { code: r.status ?? 1 } }
export function spliceArgv(template: string[], cmd: string[]): string[] { const out: string[] = []; for (const el of template) { if (el === '{cmd...}') out.push(...cmd); else out.push(el) } return out }
export function isTTY(): boolean { return Boolean(process.stdout.isTTY && process.stdin.isTTY) }
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: argv exec + streaming + splice`

---

### Task 9：`git.ts`（worktree -b + dirty + 未推 + 合并检测，Codex#2/#3/R1）

**Files:** `src/git.ts`, `test/git.test.ts`

- [ ] **Step 1：失败测试（真实临时仓 + bare origin）**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { addWorktree, removeWorktree, isDirty, mainBranch, isMergedToMain, hasUnpushed } from '../src/git.js'

const g = (cwd: string, ...a: string[]) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' })
let origin: string, clone: string
beforeEach(() => {
  origin = fs.mkdtempSync(path.join(os.tmpdir(), 'bayo-')); spawnSync('git', ['init', '-q', '--bare', '--initial-branch=master', origin])
  clone = fs.mkdtempSync(path.join(os.tmpdir(), 'bayc-')); spawnSync('git', ['clone', '-q', origin, clone])
  g(clone, 'config', 'user.email', 't@t'); g(clone, 'config', 'user.name', 't')
  fs.writeFileSync(path.join(clone, 'f'), 'a'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'init'); g(clone, 'push', '-q', 'origin', 'master')
})
afterEach(() => { for (const d of [origin, clone]) fs.rmSync(d, { recursive: true, force: true }) })

describe('git', () => {
  it('addWorktree -b + isDirty + remove', () => {
    const dir = path.join(clone, '.worktrees', 's1-x'); addWorktree(clone, dir, 'feat', 'HEAD')
    expect(fs.existsSync(path.join(dir, 'f'))).toBe(true); expect(isDirty(dir)).toBe(false)
    fs.writeFileSync(path.join(dir, 'f'), 'b'); expect(isDirty(dir)).toBe(true); removeWorktree(clone, dir, true); expect(fs.existsSync(dir)).toBe(false)
  })
  it('mainBranch/merged/unpushed', () => {
    expect(mainBranch(clone)).toBe('master')
    g(clone, 'checkout', '-qb', 'merged'); fs.writeFileSync(path.join(clone, 'g'), 'b'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'm')
    g(clone, 'checkout', '-q', 'master'); g(clone, 'merge', '-q', 'merged'); g(clone, 'push', '-q', 'origin', 'master'); expect(isMergedToMain(clone, 'merged')).toBe(true)
    g(clone, 'checkout', '-qb', 'open'); fs.writeFileSync(path.join(clone, 'h'), 'c'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'o')
    expect(isMergedToMain(clone, 'open')).toBe(false); expect(hasUnpushed(clone, 'open')).toBe(true)
  })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import { spawnSync } from 'node:child_process'
function git(repo: string, ...a: string[]) { return spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' }) }
function ok(repo: string, ...a: string[]): string { const r = git(repo, ...a); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr || r.stdout}`); return r.stdout }

export function addWorktree(repo: string, dir: string, branch: string, base: string) { ok(repo, 'worktree', 'add', '-b', branch, dir, base) }
export function removeWorktree(repo: string, dir: string, force: boolean) { const a = ['worktree', 'remove', dir]; if (force) a.push('--force'); const r = git(repo, ...a); if (r.status !== 0) throw new Error('worktree remove: ' + (r.stderr || r.stdout)); git(repo, 'worktree', 'prune') }
export function isDirty(dir: string): boolean { return ok(dir, 'status', '--porcelain').trim().length > 0 }
export function currentBranch(dir: string): string { return ok(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim() }
export function mainBranch(repo: string): string {
  const r = git(repo, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD')
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().replace(/^origin\//, '')
  for (const b of ['master', 'main']) if (git(repo, 'rev-parse', '--verify', `origin/${b}`).status === 0) return b
  return 'master'
}
export function isMergedToMain(repo: string, branch: string): boolean { git(repo, 'fetch', '-q', 'origin'); return git(repo, 'merge-base', '--is-ancestor', branch, `origin/${mainBranch(repo)}`).status === 0 }
export function remoteBranchGone(repo: string, branch: string): boolean { return git(repo, 'rev-parse', '--verify', `origin/${branch}`).status !== 0 }
export function hasUnpushed(repo: string, branch: string): boolean {
  const main = mainBranch(repo); const r = git(repo, 'log', '--oneline', `origin/${main}..${branch}`)
  if (r.status !== 0) return true
  if (!r.stdout.trim()) return false
  return remoteBranchGone(repo, branch) ? true : git(repo, 'log', '--oneline', `origin/${branch}..${branch}`).stdout.trim().length > 0
}
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: git worktree/dirty/unpushed/merge`

---

### Task 10：`engine.ts`（copy+lock 新鲜度 / env / upstream materialized / 端口预检 / setup / exec splice）

**Files:** `src/engine.ts`, `test/engine.test.ts`

- [ ] **Step 1：失败测试（纯函数）**

```ts
import { describe, it, expect } from 'vitest'
import { mergeEnvText, resolveUpstreamBase } from '../src/engine.js'

describe('engine pure', () => {
  it('mergeEnvText 覆盖/追加/保留', () => { const o = mergeEnvText('A=1\nB=2\n', { A: '9', C: '3' }); expect(o).toContain('A=9'); expect(o).not.toContain('A=1'); expect(o).toContain('B=2'); expect(o).toContain('C=3') })
  it('resolveUpstreamBase：materialized→本槽端口；否则 fallback', () => {
    const cfg: any = { portBase: 6000, slotSpan: 10, services: { api: { offset: 1 } } }
    expect(resolveUpstreamBase(cfg, 1, { service: 'api', fallback: 'http://localhost:6001' }, true)).toBe('http://localhost:6011')
    expect(resolveUpstreamBase(cfg, 1, { service: 'api', fallback: 'http://localhost:6001' }, false)).toBe('http://localhost:6001')
  })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { BayConfig, Service, renderTemplate } from './config.js'
import { blockBase, portOf, isPortFree } from './ports.js'
import { scanOccupancy } from './slots.js'
import { addWorktree } from './git.js'
import { runShell, run, spliceArgv, isTTY } from './util/exec.js'
import { warn, log } from './util/log.js'

export function mergeEnvText(text: string, kv: Record<string, string>): string {
  const lines = text.split('\n'); const seen = new Set<string>()
  const out = lines.map((line) => { const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line); if (m && kv[m[1]] !== undefined) { seen.add(m[1]); return `${m[1]}=${kv[m[1]]}` } return line })
  for (const [k, v] of Object.entries(kv)) if (!seen.has(k)) { if (out.length && out[out.length - 1] === '') out.splice(out.length - 1, 0, `${k}=${v}`); else out.push(`${k}=${v}`) }
  return out.join('\n')
}
export function resolveUpstreamBase(cfg: BayConfig, slot: number, up: { service: string; fallback: string }, materialized: boolean): string {
  return materialized ? `http://localhost:${portOf(cfg.portBase, cfg.slotSpan, slot, cfg.services[up.service].offset)}` : up.fallback
}
function upstreamMaterialized(cfg: BayConfig, slot: number, service: string): boolean {
  return (scanOccupancy(cfg).get(slot) ?? []).some((o) => o.service === service)   // 仅 worktree 已建（Codex#4）
}

export interface AddCtx { cfg: BayConfig; service: string; sp: Service; slot: number; slug: string; dir: string; repo: string; vars: Record<string, string | number> }
export function buildVars(cfg: BayConfig, ctx: Omit<AddCtx, 'vars'>): Record<string, string | number> {
  const base: Record<string, string | number> = { slot: ctx.slot, blockBase: blockBase(cfg.portBase, cfg.slotSpan, ctx.slot), port: portOf(cfg.portBase, cfg.slotSpan, ctx.slot, ctx.sp.offset), slug: ctx.slug, worktree: ctx.dir, repo: ctx.repo }
  if (ctx.sp.upstream) base.upstreamBase = resolveUpstreamBase(cfg, ctx.slot, ctx.sp.upstream, upstreamMaterialized(cfg, ctx.slot, ctx.sp.upstream.service))
  for (const [k, v] of Object.entries(ctx.sp.vars ?? {})) base[k] = renderTemplate(v, base)
  return base
}

export async function bringUp(ctx: AddCtx, base: string, branch: string): Promise<void> {
  const { sp, dir, repo, vars } = ctx
  if (!(await isPortFree(Number(vars.port)))) throw new Error(`port ${vars.port} 被占用（Codex#11）`)   // 端口预检
  addWorktree(repo, dir, branch, base)                                                                  // worktree -b
  for (const rel of sp.copy ?? []) {                                                                     // copy + lock 新鲜度
    fs.cpSync(path.join(repo, rel), path.join(dir, rel), { recursive: true })
    for (const lock of ['composer.lock', 'pnpm-lock.yaml', 'package-lock.json']) {
      const a = path.join(repo, lock), b = path.join(dir, lock)
      if (fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) warn(`⚠ ${lock} 与主 checkout 不一致，拷来依赖可能版本错位，建议改跑安装（Codex#18）`)
    }
  }
  for (const [file, kv] of Object.entries(sp.env ?? {})) {                                               // env 合并
    const fp = path.join(dir, file); const cur = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : ''
    const rendered: Record<string, string> = {}; for (const [k, v] of Object.entries(kv)) rendered[k] = renderTemplate(v, vars)
    fs.writeFileSync(fp, mergeEnvText(cur, rendered))
  }
  if (sp.setup) { const r = runShell(renderTemplate(sp.setup, vars), { cwd: dir }); if (r.code !== 0) throw new Error('setup 失败') }   // setup
  if (sp.start) log(`  启动: (cd ${dir} && ${renderTemplate(sp.start, vars)})`)                          // start：打印
}

export function execArgv(ctx: { sp: Service; vars: Record<string, string | number> }, cmd: string[]): string[] {
  const tpl = (ctx.sp.exec ?? ['sh', '-c', '{cmd...}']).map((el) => el === '{cmd...}' ? el : renderTemplate(el, ctx.vars))
  const spliced = spliceArgv(tpl, cmd)
  if (isTTY() && cmd[0] === 'sh' && spliced.includes('exec')) spliced.splice(spliced.indexOf('exec') + 1, 0, '-it')   // sh TTY（Codex#17）
  return spliced
}
export { run }
```

- [ ] **Step 4：PASS** · **Step 5：Commit** `feat: step engine (copy+lock check/env/upstream materialized/port preflight/setup/exec)`

---

### Task 11：`worktree-bay add`

**Files:** `src/commands/add.ts`, `src/cli.ts`, `test/add.test.ts`

- [ ] **Step 1：失败测试（resolveAdd）**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { resolveAdd } from '../src/commands/add.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayadd-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 } } } })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('add resolve', () => {
  it('解析槽/slug/目录/仓', () => { claim(cfg, 'f'); const r = resolveAdd(cfg, 'f', 'api', 'feature/x'); expect(r.slot).toBe(1); expect(r.slug).toBe('s1-feature-x'); expect(r.dir).toContain(path.join('api', '.worktrees', 's1-feature-x')) })
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import path from 'node:path'
import { BayConfig, repoPath } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { slugify, worktreeDirName } from '../naming.js'
import { AddCtx, buildVars, bringUp } from '../engine.js'
import { log } from '../util/log.js'

export interface AddPlan { service: string; slot: number; slug: string; dir: string; repo: string }
export function resolveAdd(cfg: BayConfig, feature: string, service: string, branch: string): AddPlan {
  if (!cfg.services[service]) throw new Error('unknown service: ' + service)
  const slot = claim(cfg, feature); const slug = worktreeDirName(slot, slugify(branch))
  return { service, slot, slug, dir: path.join(repoPath(cfg, service), '.worktrees', slug), repo: repoPath(cfg, service) }
}
export async function addCommand(cfg: BayConfig, feature: string, service: string, branch: string, base?: string) {
  await withLock(cfg.workspaceRoot, async () => {
    const p = resolveAdd(cfg, feature, service, branch); const sp = cfg.services[service]
    const ctxBase = { cfg, service, sp, slot: p.slot, slug: p.slug, dir: p.dir, repo: p.repo }
    const ctx: AddCtx = { ...ctxBase, vars: buildVars(cfg, ctxBase) }
    await bringUp(ctx, base ?? 'origin/HEAD', branch)
    log(`✓ ${service} 挂入 "${feature}"（槽 ${p.slot}，端口 ${ctx.vars.port}）`)
  })
}
```

- [ ] **Step 4：`cli.ts`**

```ts
import { addCommand } from './commands/add.js'
program.command('add <feature> <service> <branch> [base]').action(async (f, s, b, base) => { try { await addCommand(loadConfig(process.cwd()), f, s, b, base) } catch (e) { die((e as Error).message) } })
```

- [ ] **Step 5：PASS + 手动 e2e**（rqapp 配好 config 后 `worktree-bay claim t && worktree-bay add t api feature/test`，验证端口预检/worktree/.env/vendor 拷贝/compose 起）

- [ ] **Step 6：Commit** `feat: worktree-bay add (engine end-to-end)`

---

### Task 12：`worktree-bay run` / `worktree-bay sh` / `worktree-bay rm`

**Files:** `src/commands/{passthrough,rm}.ts`, `src/cli.ts`, `test/passthrough.test.ts`

- [ ] **Step 1：失败测试（resolveRm）**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { resolveRm } from '../src/commands/rm.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'bayrm-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 } } }; claim(cfg, 'f'); fs.mkdirSync(path.join(ws, 'api', '.worktrees', 's1-feature-x'), { recursive: true }) })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('rm', () => { it('resolveRm 整槽列 occupant', () => { const t = resolveRm(cfg, 'f'); expect(t.map((o) => o.service)).toEqual(['api']); expect(t[0].slug).toBe('s1-feature-x') }) })
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：`commands/passthrough.ts`**

```ts
import { BayConfig, repoPath } from '../config.js'
import { scanOccupancy, slotOfFeature } from '../slots.js'
import { buildVars, execArgv, run } from '../engine.js'

function ctxOf(cfg: BayConfig, feature: string, service: string) {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error('unknown feature: ' + feature)
  const occ = (scanOccupancy(cfg).get(slot) ?? []).find((o) => o.service === service); if (!occ) throw new Error(`${service} not in ${feature}`)
  const sp = cfg.services[service]
  return { sp, vars: buildVars(cfg, { cfg, service, sp, slot, slug: occ.slug, dir: occ.dir, repo: repoPath(cfg, service) }) }
}
export function runCommand(cfg: BayConfig, feature: string, service: string, name: string, args: string[]) {
  const ctx = ctxOf(cfg, feature, service); const named = ctx.sp.run?.[name]; if (!named) throw new Error(`run.${name} 未定义于 ${service}`)
  const argv = execArgv(ctx, [...named, ...args]); process.exit(run(argv[0], argv.slice(1)).code)
}
export function shCommand(cfg: BayConfig, feature: string, service: string) {
  const ctx = ctxOf(cfg, feature, service); const argv = execArgv(ctx, ['sh']); process.exit(run(argv[0], argv.slice(1)).code)
}
```

- [ ] **Step 4：`commands/rm.ts`**

```ts
import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, removeLabel, Occupant } from '../slots.js'
import { buildVars } from '../engine.js'
import { isDirty, hasUnpushed, currentBranch, removeWorktree } from '../git.js'
import { runShell } from '../util/exec.js'
import { log, warn } from '../util/log.js'

export function resolveRm(cfg: BayConfig, feature: string, service?: string): Occupant[] {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error('unknown feature: ' + feature)
  const all = scanOccupancy(cfg).get(slot) ?? []; return service ? all.filter((o) => o.service === service) : all
}
export async function rmCommand(cfg: BayConfig, feature: string, service: string | undefined, force: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    for (const o of resolveRm(cfg, feature, service)) {
      const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      if (!force && (isDirty(o.dir) || hasUnpushed(repo, branch))) { warn(`跳过 ${o.service}：有未提交/未推改动（-f 强删）`); continue }
      const sp = cfg.services[o.service]
      if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot: o.slot, slug: o.slug, dir: o.dir, repo }); runShell(renderTemplate(sp.teardown, vars), { cwd: repo }) }   // teardown by project（Codex#12）
      removeWorktree(repo, o.dir, force); log(`✓ 移除 ${o.service}`)
    }
    const slot = slotOfFeature(cfg, feature)!
    if (!service && (scanOccupancy(cfg).get(slot) ?? []).length === 0) removeLabel(cfg, slot)
  })
}
```

- [ ] **Step 5：`cli.ts`**

```ts
import { runCommand, shCommand } from './commands/passthrough.js'
import { rmCommand } from './commands/rm.js'
program.command('run <feature> <service> <name> [args...]').action((f, s, n, args) => sync((c) => runCommand(c, f, s, n, args ?? [])))
program.command('sh <feature> <service>').action((f, s) => sync((c) => shCommand(c, f, s)))
program.command('rm <feature> [service]').option('-f, --force').action(async (f, s, o) => { try { await rmCommand(loadConfig(process.cwd()), f, s, !!o.force) } catch (e) { die((e as Error).message) } })
```

- [ ] **Step 6：PASS + 手动验证** · **Step 7：Commit** `feat: run/sh passthrough + rm (dirty+unpushed guard, teardown-by-project)`

---

## M3：合并感知回收 `worktree-bay gc`

### Task 13：`worktree-bay gc` 三档 + squash 信号 + 空预约

**Files:** `src/commands/gc.ts`, `src/cli.ts`, `test/gc.test.ts`

- [ ] **Step 1：失败测试（分类纯函数）**

```ts
import { describe, it, expect } from 'vitest'
import { classifyForGc } from '../src/commands/gc.js'

describe('gc classify', () => {
  it('已合并+干净=auto-remove', () => expect(classifyForGc({ merged: true, dirty: false, unpushed: false })).toBe('auto-remove'))
  it('已合并+脏=flag', () => expect(classifyForGc({ merged: true, dirty: true, unpushed: false })).toBe('flag'))
  it('未合并=keep', () => expect(classifyForGc({ merged: false, dirty: false, unpushed: false })).toBe('keep'))
  it('已合并但未推=flag', () => expect(classifyForGc({ merged: true, dirty: false, unpushed: true })).toBe('flag'))
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, pruneEmptyLabels, removeLabel } from '../slots.js'
import { buildVars } from '../engine.js'
import { currentBranch, isDirty, hasUnpushed, isMergedToMain, remoteBranchGone, removeWorktree } from '../git.js'
import { runShell } from '../util/exec.js'
import { log, warn } from '../util/log.js'

export type Verdict = 'auto-remove' | 'flag' | 'keep'
export function classifyForGc(s: { merged: boolean; dirty: boolean; unpushed: boolean }): Verdict {
  if (s.merged && !s.dirty && !s.unpushed) return 'auto-remove'
  if (s.merged) return 'flag'
  return 'keep'
}
export async function gcCommand(cfg: BayConfig, apply: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    for (const [slot, occupants] of scanOccupancy(cfg)) for (const o of occupants) {
      const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      const v = classifyForGc({ merged: isMergedToMain(repo, branch), dirty: isDirty(o.dir), unpushed: hasUnpushed(repo, branch) })
      if (v === 'auto-remove') {
        log(`[gc] ${o.service} (slot ${slot}) 已合并且干净 → 移除`)
        if (apply) { const sp = cfg.services[o.service]; if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot, slug: o.slug, dir: o.dir, repo }); runShell(renderTemplate(sp.teardown, vars), { cwd: repo }) } removeWorktree(repo, o.dir, false) }
      } else if (v === 'flag') warn(`[gc] ${o.service} (slot ${slot}) 已合并但脏/未推 → 跳过，确认后手动删`)
      else if (remoteBranchGone(repo, branch)) warn(`[gc] ${o.service} (slot ${slot}) 远端分支已删（疑似 squash）→ 确认后 worktree-bay rm`)
    }
    for (const { slot, feature } of pruneEmptyLabels(cfg)) { log(`[gc] 槽 ${slot}（${feature}）空预约（无 worktree）`); if (apply) removeLabel(cfg, slot) }
    if (!apply) log('（dry-run；加 --apply 执行 auto-remove 与空预约清理）')
  })
}
```

- [ ] **Step 4：`cli.ts`**

```ts
import { gcCommand } from './commands/gc.js'
program.command('gc').option('--apply').action(async (o) => { try { await gcCommand(loadConfig(process.cwd()), !!o.apply) } catch (e) { die((e as Error).message) } })
```

- [ ] **Step 5：PASS + 手动验证 dry-run/apply** · **Step 6：Commit** `feat: worktree-bay gc (merge-aware + squash hint + empty-label)`

---

## M4：`worktree-bay completion`（tab 补全）

### Task 14：动态补全

**Files:** `src/commands/completion.ts`, `src/cli.ts`, `test/completion.test.ts`

- [ ] **Step 1：失败测试（候选计算）**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import type { BayConfig } from '../src/config.js'
import { complete } from '../src/commands/completion.js'
import { claim } from '../src/slots.js'

let ws: string; let cfg: BayConfig
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), 'baycomp-')); fs.mkdirSync(path.join(ws, 'api')); cfg = { workspaceRoot: ws, portBase: 6000, slotSpan: 10, maxSlots: 9, configDir: ws, services: { api: { offset: 1 }, lms: { offset: 2 } } }; claim(cfg, 'drill') })
afterEach(() => fs.rmSync(ws, { recursive: true, force: true }))

describe('completion', () => {
  it('第一参补子命令', () => expect(complete(cfg, ['worktree-bay'])).toContain('add'))
  it('add 第二参补 feature', () => expect(complete(cfg, ['worktree-bay', 'add'])).toContain('drill'))
  it('add 第三参补 service', () => expect(complete(cfg, ['worktree-bay', 'add', 'drill'])).toEqual(expect.arrayContaining(['api', 'lms'])))
})
```

- [ ] **Step 2：FAIL**

- [ ] **Step 3：实现**

```ts
import { BayConfig } from '../config.js'
import { readLabels } from '../slots.js'
import { log } from '../util/log.js'

const SUBCMDS = ['claim', 'add', 'ls', 'gc', 'rm', 'run', 'sh', 'completion']
export function complete(cfg: BayConfig, words: string[]): string[] {
  const args = words.slice(1)
  if (args.length <= 1) return SUBCMDS
  const sub = args[0]; const pos = args.length - 1
  if (['add', 'rm', 'run', 'sh'].includes(sub) && pos === 1) return Object.values(readLabels(cfg))
  if (['add', 'run', 'sh'].includes(sub) && pos === 2) return Object.keys(cfg.services)
  return []
}
export function completionScript(shell: string): string {
  if (shell === 'bash') return `_worktree_bay(){ COMPREPLY=( $(worktree-bay --complete -- "\${COMP_WORDS[@]}") ); }\ncomplete -F _worktree_bay worktree-bay`
  if (shell === 'zsh') return `#compdef worktree-bay\n_worktree_bay(){ compadd -- $(worktree-bay --complete -- "\${words[@]}") }\ncompdef _worktree_bay worktree-bay`
  if (shell === 'fish') return `complete -c worktree-bay -a '(worktree-bay --complete -- (commandline -opc))'`
  throw new Error('unsupported shell: ' + shell)
}
export function completionCommand(shell: string) { log(completionScript(shell)) }
```

- [ ] **Step 4：`cli.ts`（含隐藏 --complete）**

```ts
import { complete, completionCommand } from './commands/completion.js'
program.command('completion <shell>').action((sh) => sync(() => completionCommand(sh)))
program.command('--complete', { hidden: true }).allowUnknownOption().action(() => {
  const words = process.argv.slice(process.argv.indexOf('--') + 1)
  try { console.log(complete(loadConfig(process.cwd()), words).join('\n')) } catch { /* 静默 */ }
})
```

- [ ] **Step 5：PASS** · **Step 6：Commit** `feat: worktree-bay completion (dynamic bash/zsh/fish)`

---

## M5：工作区接线 + 文档迁移

### Task 15：rqapp `worktree-bay.config.json`

**Files:** `C:/Users/hugh.li/Data/rqapp/worktree-bay.config.json`

- [ ] **Step 1：写配置（exec/run 用 argv 数组；前端 env 文件名/变量名按 §5 实测核对）**

```json
{
  "workspaceRoot": "C:/Users/hugh.li/Data/rqapp",
  "portBase": 6000, "slotSpan": 10, "maxSlots": 9,
  "services": {
    "api":     { "offset": 1, "vars": { "project": "rqapi-{slug}" }, "copy": [".env", "vendor"],
                 "env": { ".env": { "APP_EXPOSE_PORT": "{port}", "REDIS_PREFIX": "rq:dev:{slug}:" } },
                 "setup": "docker compose -p {project} up -d", "teardown": "docker compose -p {project} down -v",
                 "exec": ["docker","exec","-i","{project}-app-1","{cmd...}"],
                 "run": { "test": ["composer","run","test:parallel"], "artisan": ["php","artisan"] } },
    "lms":     { "offset": 2, "upstream": { "service": "api", "fallback": "http://localhost:6001" },
                 "env": { ".env.dev.local": { "VITE_SERVICE_BASE_URL": "{upstreamBase}" } }, "setup": "pnpm install", "start": "pnpm dev --port {port}" },
    "pc":      { "offset": 3, "upstream": { "service": "api", "fallback": "http://localhost:6001" },
                 "env": { ".env.development": { "VITE_API_BASE_URL": "{upstreamBase}" } }, "setup": "pnpm install", "start": "pnpm dev --port {port}" },
    "csp":     { "offset": 4, "upstream": { "service": "api", "fallback": "http://localhost:6001" },
                 "env": { ".env.dev.local": { "VITE_API_BASE_URL": "{upstreamBase}" } }, "setup": "pnpm install", "start": "pnpm dev --port {port}" },
    "console": { "offset": 5, "upstream": { "service": "api", "fallback": "http://localhost:6001" },
                 "env": { ".env.dev.local": { "VITE_SERVICE_BASE_URL": "{upstreamBase}" } }, "setup": "pnpm install", "start": "pnpm dev --port {port}" },
    "h5":      { "offset": 6, "upstream": { "service": "api", "fallback": "http://localhost:6001" },
                 "env": { ".env.development": { "VITE_API_BASE_URL": "{upstreamBase}" } }, "setup": "pnpm install", "start": "pnpm dev --port {port}" }
  }
}
```

> 执行期：逐个前端确认 vite 用的 mode 文件名（`.env.dev.local` vs `.env.development`）与变量名（`VITE_SERVICE_BASE_URL` vs `VITE_API_BASE_URL`），按 spec §5 实测表填准；并确认 `pnpm dev --port` 是否需 `--` 透传，需则写成 `pnpm dev -- --port {port}`。

- [ ] **Step 2：`WORKTREE_BAY_CONFIG=...worktree-bay.config.json worktree-bay ls` 通过校验**

---

### Task 16：rqapp 放行配置 + 各仓忽略 `.worktrees/`

**Files:** `rqapp/.gitignore`、各子项目 `.gitignore`

- [ ] **Step 1：rqapp `.gitignore` 显式放行段加 `!/worktree-bay.config.json`**（`.worktree-bay-slots.json`、`.worktree-bay/` 默认忽略不放行）

- [ ] **Step 2：提交 rqapp 元仓库**

```bash
cd C:/Users/hugh.li/Data/rqapp && git add .gitignore worktree-bay.config.json && git commit -m "chore(workspace): 接入 worktree-bay 槽位编排（放行 worktree-bay.config.json）"
```

- [ ] **Step 3：各子项目确认忽略 `.worktrees/`**

```bash
for d in api lms pc csp console h5; do cd C:/Users/hugh.li/Data/rqapp/$d && git check-ignore .worktrees/ >/dev/null || { printf '\n/.worktrees/\n' >> .gitignore && git add .gitignore && git commit -m "chore: ignore .worktrees/"; }; done
```

---

### Task 17：P1 benchmark + CLAUDE.md 指引 + 文档迁移

**Files:** rqapp/CLAUDE.md、api/CLAUDE.md；迁移 spec+plan → `~/Data/ms/worktree-bay/docs/`

- [ ] **Step 1：benchmark 拷 vendor vs 暖 composer install**（各计时一次；结论回填 spec §5/§7 P1；若拷不划算，api 也改 `setup` 内安装）

- [ ] **Step 2：api/CLAUDE.md「Worktree 隔离开发」段顶部加引导**

```markdown
> **并行开发首选 `worktree-bay`**：`worktree-bay claim <feature>` → `worktree-bay add <feature> api <branch>`，自动处理端口块/依赖/测试库隔离/回收。工具见 `~/Data/ms/worktree-bay`、配置 `rqapp/worktree-bay.config.json`。下面手动 compose 配方仅作底层参考。
```

- [ ] **Step 3：rqapp/CLAUDE.md worktree 约定段加一行 worktree-bay 指引**

- [ ] **Step 4：迁移设计 spec 与本计划到 `~/Data/ms/worktree-bay/docs/`，worktree-bay 仓 add+commit**

```bash
mkdir -p ~/Data/ms/worktree-bay/docs
cp C:/Users/hugh.li/Data/rqapp/api/docs/superpowers/specs/2026-06-05-worktree-slot-orchestration-design.md ~/Data/ms/worktree-bay/docs/design.md
cp C:/Users/hugh.li/Data/rqapp/api/docs/superpowers/plans/2026-06-05-bay-worktree-orchestrator.md ~/Data/ms/worktree-bay/docs/plan.md
cd ~/Data/ms/worktree-bay && git add -A && git commit -m "docs: import design + plan"
```

- [ ] **Step 5：（用户自行）`git remote add origin <github>` 并 push** —— 本计划不 push。

---

## 自检（写完计划后）

- **Spec 覆盖**：定位收窄→3.0；schema+校验 V1–V5→T4/T15；端口→T3；命名+slug 碰撞→T2；锁→T5/各命令；占用派生+空预约→T6；claim/ls→T7；argv exec+streaming+TTY→T8；git(-b/dirty/未推/合并)→T9；通用引擎(copy+lock 新鲜度/env/upstream materialized/端口预检/setup)→T10；add→T11；run/sh/rm(teardown by project)→T12；gc 三档+squash 信号+空预约→T13；completion→T14；接线+benchmark+迁移→T15–17。全覆盖。
- **占位扫描**：无 TBD；前端 env 文件名/变量名、`pnpm dev --port` 透传写法标注为执行期按 §5 实测确认（非占位）。
- **类型一致**：`BayConfig/Service/Occupant/AddCtx/AddPlan/Verdict` 跨任务一致；`buildVars`/`execArgv`/`run` 在 engine 定义后被 add/passthrough/rm/gc 复用同签名。
- **Codex 评审项落实**：锁(T5)、branch -b(T9/T11)、upstream materialized(T10)、argv splice(T8/T10)、端口预检(T10)、teardown by project(T12/T13)、copy lock 新鲜度(T10)、未推保守(T9)、slug 碰撞(T2)、校验扩展(T4)、sh TTY(T10)、squash 远端删信号(T9/T13)、空预约(T6/T13)。
