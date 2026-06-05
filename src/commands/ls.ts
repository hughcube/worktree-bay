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
    lines.push(`slot ${n}  ${labels[String(n)] ?? '(unnamed)'}  block=${base}  [${svc.join(', ') || 'no worktree'}]`)
  }
  return lines.join('\n') || '(no slots in use)'
}
export function slotsData(cfg: BayConfig): object[] {
  const occ = scanOccupancy(cfg); const labels = readLabels(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(labels).map(Number)])
  return [...slots].sort((a, b) => a - b).map((n) => {
    const base = blockBase(cfg.portBase, cfg.slotSpan, n)
    return { slot: n, feature: labels[String(n)] ?? null, block: base, services: (occ.get(n) ?? []).map((o) => ({ service: o.service, port: base + cfg.services[o.service].offset, dir: o.dir })) }
  })
}
export function lsCommand(cfg: BayConfig, json = false) { log(json ? JSON.stringify(slotsData(cfg), null, 2) : renderSlots(cfg)) }
