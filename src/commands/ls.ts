import { BayConfig } from '../config.js'
import { scanOccupancy, readLabels } from '../slots.js'
import { portOf } from '../ports.js'
import { log } from '../util/log.js'
import { recordedFor, pidAlive } from '../proc.js'
import { t } from '../i18n.js'

// 该 worktree 是否有存活的托管 dev server（用于 ls 标注 ▸run）
function running(cfg: BayConfig, dir: string): boolean { const r = recordedFor(cfg.workspaceRoot, dir); return !!r && pidAlive(r.pid) }

export function renderSlots(cfg: BayConfig): string {
  const occ = scanOccupancy(cfg); const labels = readLabels(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(labels).map(Number)])
  const lines: string[] = []
  for (const n of [...slots].sort((a, b) => a - b)) {
    const svc = (occ.get(n) ?? []).map((o) => `${o.service}@${portOf(cfg.services[o.service].port, n)}${running(cfg, o.dir) ? ' ▸run' : ''}`)
    lines.push(`slot ${n}  ${labels[String(n)] ?? t('(未命名)', '(unnamed)')}  [${svc.join(', ') || t('无 worktree', 'no worktree')}]`)
  }
  return lines.join('\n') || t('(无槽位在用)', '(no slots in use)')
}
export function slotsData(cfg: BayConfig): object[] {
  const occ = scanOccupancy(cfg); const labels = readLabels(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(labels).map(Number)])
  return [...slots].sort((a, b) => a - b).map((n) => ({
    slot: n, feature: labels[String(n)] ?? null,
    services: (occ.get(n) ?? []).map((o) => ({ service: o.service, port: portOf(cfg.services[o.service].port, n), dir: o.dir, running: running(cfg, o.dir) })),
  }))
}
export function lsCommand(cfg: BayConfig, json = false) { log(json ? JSON.stringify(slotsData(cfg), null, 2) : renderSlots(cfg)) }
