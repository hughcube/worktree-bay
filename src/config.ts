import fs from 'node:fs'
import path from 'node:path'
import { t } from './i18n.js'

export interface Service { port: number; repo?: string; vars?: Record<string, string>; copy?: string[]; env?: Record<string, Record<string, string>>; upstream?: { service: string; fallback: string }; setup?: string; teardown?: string; start?: string; stop?: string; exec?: string[]; run?: Record<string, string[]> }
export interface BayConfig { workspaceRoot: string; maxSlots: number; services: Record<string, Service>; configDir: string }

function refs(tpl: string): string[] { return [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) }

export function parseConfig(configPath: string): BayConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (raw.maxSlots === undefined) throw new Error(t('config: 缺少必填字段 maxSlots', 'config: maxSlots required'))
  const configDir = path.dirname(configPath)
  // workspaceRoot 非必选，默认当前目录（= config 所在目录）；相对路径相对 config 目录解析，
  // 已是绝对路径时 path.resolve 原样返回（向后兼容，且不再受进程 cwd 影响）
  const workspaceRoot = path.resolve(configDir, raw.workspaceRoot ?? '.')
  const maxSlots: number = raw.maxSlots
  const services: Record<string, Service> = raw.services ?? {}
  // 端口段：每个服务 [port, port+maxSlots]（port=主 dev/槽0，槽 1..maxSlots 落在段内）
  for (const [name, sp] of Object.entries<Service>(services)) {
    if (typeof sp.port !== 'number' || sp.port < 1) throw new Error(t(`config: ${name}.port 必须是正整数`, `config: ${name}.port must be a positive number`))  // V2
    const repoDir = path.join(workspaceRoot, sp.repo ?? name)
    if (!fs.existsSync(repoDir)) throw new Error(t(`config: ${name}.repo 目录不存在: ${repoDir}（检查 workspaceRoot 与 repo 名，或先 git clone）`, `config: ${name}.repo dir missing: ${repoDir} (check workspaceRoot and the repo name, or clone it first)`))  // V5
  }
  const entries = Object.entries<Service>(services)
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {                             // V1: 段不重叠
    if (Math.abs(entries[i][1].port - entries[j][1].port) <= maxSlots) throw new Error(t(`config: 服务 ${entries[i][0]} 与 ${entries[j][0]} 端口段重叠（两服务 port 间距需 > maxSlots=${maxSlots}，请拉开端口基址）`, `config: services ${entries[i][0]} and ${entries[j][0]} have overlapping port segments (|portA-portB| must be > maxSlots=${maxSlots}; spread the base ports apart)`))
  }
  for (const [name, sp] of Object.entries<Service>(services)) if (sp.upstream && !services[sp.upstream.service]) throw new Error(t(`config: ${name}.upstream.service '${sp.upstream.service}' 不存在于 services（写成已声明的服务名）`, `config: ${name}.upstream.service '${sp.upstream.service}' not found in services (use a declared service name)`))  // V3
  const known = new Set(['slot', 'port', 'slug', 'worktree', 'repo', 'upstreamBase', 'cmd'])                          // V4
  for (const sp of Object.values(services)) for (const v of Object.values(sp.vars ?? {})) for (const ref of refs(v)) if (!known.has(ref) && !(sp.vars && ref in sp.vars)) throw new Error(t(`config: 未知模板变量 {${ref}}（只能引用内置变量或本服务 vars 里已声明的）`, `config: unknown template var {${ref}} (only built-in vars or this service's declared vars are allowed)`))
  return { workspaceRoot, maxSlots, services, configDir }
}

export function loadConfig(startDir: string): BayConfig {
  if (process.env.WORKTREE_BAY_CONFIG) return parseConfig(process.env.WORKTREE_BAY_CONFIG)
  let dir = path.resolve(startDir)
  for (;;) { const p = path.join(dir, 'worktree-bay.config.json'); if (fs.existsSync(p)) return parseConfig(p); const parent = path.dirname(dir); if (parent === dir) throw new Error(t('未找到 worktree-bay.config.json。请在工作区根目录运行 `worktree-bay init` 生成，或用环境变量 WORKTREE_BAY_CONFIG 指定其绝对路径。', 'worktree-bay.config.json not found. Run `worktree-bay init` in your workspace root to create one, or set WORKTREE_BAY_CONFIG to its absolute path.')); dir = parent }
}

export function repoPath(cfg: BayConfig, service: string): string {
  const sp = cfg.services[service]; if (!sp) throw new Error(t(`未知服务「${service}」。运行 \`worktree-bay doctor\` 查看配置里有哪些服务。`, `unknown service "${service}". Run \`worktree-bay doctor\` to see configured services.`))
  return path.join(cfg.workspaceRoot, sp.repo ?? service)
}
export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`))
}
