import { BayConfig } from '../config.js'
import { scanOccupancy, readLabels } from '../slots.js'
import { portOf } from '../ports.js'
import { log } from '../util/log.js'
import { recordedFor, pidOnPort } from '../proc.js'
import { t } from '../i18n.js'

// 该服务的约定端口是否有进程在监听（按端口判，不受 shell/pnpm 让记录 pid 漂移的影响）
function running(cfg: BayConfig, dir: string, port: number): boolean { return !!recordedFor(cfg.workspaceRoot, dir) && !!pidOnPort(port) }

export function renderSlots(cfg: BayConfig): string {
  const occ = scanOccupancy(cfg); const labels = readLabels(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(labels).map(Number)])
  const lines: string[] = []
  for (const n of [...slots].sort((a, b) => a - b)) {
    const svc = (occ.get(n) ?? []).map((o) => { const p = portOf(cfg.services[o.service].port, n); return `${o.service}@${p}${running(cfg, o.dir, p) ? ' ▸run' : ''}` })
    lines.push(`slot ${n}  ${labels[String(n)] ?? t('(未命名)', '(unnamed)')}  [${svc.join(', ') || t('无 worktree', 'no worktree')}]`)
  }
  return lines.join('\n') || t('(无槽位在用)', '(no slots in use)')
}
export function slotsData(cfg: BayConfig): object[] {
  const occ = scanOccupancy(cfg); const labels = readLabels(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(labels).map(Number)])
  return [...slots].sort((a, b) => a - b).map((n) => ({
    slot: n, feature: labels[String(n)] ?? null,
    services: (occ.get(n) ?? []).map((o) => { const p = portOf(cfg.services[o.service].port, n); return { service: o.service, port: p, dir: o.dir, running: running(cfg, o.dir, p) } }),
  }))
}
export function lsCommand(cfg: BayConfig, json = false) { log(json ? JSON.stringify(slotsData(cfg), null, 2) : renderSlots(cfg)) }
