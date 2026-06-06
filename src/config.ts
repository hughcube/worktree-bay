import fs from 'node:fs'
import path from 'node:path'

export interface Service { port: number; repo?: string; vars?: Record<string, string>; copy?: string[]; env?: Record<string, Record<string, string>>; upstream?: { service: string; fallback: string }; setup?: string; teardown?: string; start?: string; exec?: string[]; run?: Record<string, string[]> }
export interface BayConfig { workspaceRoot: string; maxSlots: number; services: Record<string, Service>; configDir: string }

function refs(tpl: string): string[] { return [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]) }

export function parseConfig(configPath: string): BayConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  for (const k of ['workspaceRoot', 'maxSlots']) if (raw[k] === undefined) throw new Error(`config: ${k} required`)
  const maxSlots: number = raw.maxSlots
  const services: Record<string, Service> = raw.services ?? {}
  // 端口段：每个服务 [port, port+maxSlots]（port=主 dev/槽0，槽 1..maxSlots 落在段内）
  for (const [name, sp] of Object.entries<Service>(services)) {
    if (typeof sp.port !== 'number' || sp.port < 1) throw new Error(`config: ${name}.port must be a positive number`)  // V2
    const repoDir = path.join(raw.workspaceRoot, sp.repo ?? name)
    if (!fs.existsSync(repoDir)) throw new Error(`config: ${name}.repo dir missing: ${repoDir}`)                       // V5
  }
  const entries = Object.entries<Service>(services)
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {                             // V1: 段不重叠
    if (Math.abs(entries[i][1].port - entries[j][1].port) <= maxSlots) throw new Error(`config: 服务 ${entries[i][0]} 与 ${entries[j][0]} 端口段重叠（间距需 > maxSlots=${maxSlots}）`)
  }
  for (const [name, sp] of Object.entries<Service>(services)) if (sp.upstream && !services[sp.upstream.service]) throw new Error(`config: ${name}.upstream.service '${sp.upstream.service}' not found`)  // V3
  const known = new Set(['slot', 'port', 'slug', 'worktree', 'repo', 'upstreamBase', 'cmd'])                          // V4
  for (const sp of Object.values(services)) for (const v of Object.values(sp.vars ?? {})) for (const ref of refs(v)) if (!known.has(ref) && !(sp.vars && ref in sp.vars)) throw new Error(`config: unknown template var {${ref}}`)
  return { workspaceRoot: raw.workspaceRoot, maxSlots, services, configDir: path.dirname(configPath) }
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
