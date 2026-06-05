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
