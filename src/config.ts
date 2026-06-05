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
  if (process.env.BAY_CONFIG) return parseConfig(process.env.BAY_CONFIG)
  let dir = path.resolve(startDir)
  for (;;) { const p = path.join(dir, 'bay.config.json'); if (fs.existsSync(p)) return parseConfig(p); const parent = path.dirname(dir); if (parent === dir) throw new Error('bay.config.json not found'); dir = parent }
}

export function repoPath(cfg: BayConfig, service: string): string {
  const sp = cfg.services[service]; if (!sp) throw new Error('unknown service: ' + service)
  return path.join(cfg.workspaceRoot, sp.repo ?? service)
}
export function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`))
}
