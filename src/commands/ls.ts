import { BayConfig } from '../config.js'
import { scanOccupancy, readSlots } from '../slots.js'
import { portOf } from '../ports.js'
import { log } from '../util/log.js'
import { pidOnPort } from '../proc.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

// 「在跑」= 该服务约定端口上有进程监听，覆盖三类：docker(setup) / managed dev server(start) / 外部手起。
// 只按端口判：不依赖进程账本 dir 精确匹配（dir 相对/绝对形态会漂移），docker 服务也无 managed 记录。
function running(port: number): boolean { return !!pidOnPort(port) }

export function renderSlots(cfg: BayConfig): string {
  const occ = scanOccupancy(cfg); const metas = readSlots(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(metas).map(Number)])
  const lines: string[] = []
  for (const n of [...slots].sort((a, b) => a - b)) {
    const meta = metas[String(n)]
    const svc = (occ.get(n) ?? []).map((o) => { const p = portOf(cfg.services[o.service].port, n); const dot = running(p) ? c.green('●') : c.dim('●'); return `${dot}${o.service}@${p}` })
    lines.push(`${c.bold(c.cyan(String(n)))}${c.dim(':')} ${c.bold(meta?.feature ?? t('(未命名)', '(unnamed)'))}  [${svc.join(', ') || c.dim(t('无 worktree', 'no worktree'))}]`)
    if (meta) {   // 副行：介绍 + 分支(异于功能名时) + 创建日期，给重入/总览更多上下文
      const bits: string[] = []
      if (meta.description) bits.push(meta.description)
      if (meta.branch && meta.branch !== meta.feature) bits.push(t(`分支 ${meta.branch}`, `branch ${meta.branch}`))
      if (meta.createdAt) bits.push(meta.createdAt.slice(0, 10))
      if (bits.length) lines.push('   ' + c.dim(bits.join(' · ')))
    }
  }
  return lines.join('\n') || t('(无槽位在用)', '(no slots in use)')
}
export function slotsData(cfg: BayConfig): object[] {
  const occ = scanOccupancy(cfg); const metas = readSlots(cfg)
  const slots = new Set<number>([...occ.keys(), ...Object.keys(metas).map(Number)])
  return [...slots].sort((a, b) => a - b).map((n) => {
    const meta = metas[String(n)]
    return {
      slot: n, feature: meta?.feature ?? null, branch: meta?.branch ?? null,
      description: meta?.description ?? null, createdAt: meta?.createdAt ?? null,
      services: (occ.get(n) ?? []).map((o) => { const p = portOf(cfg.services[o.service].port, n); return { service: o.service, port: p, dir: o.dir, running: running(p) } }),
    }
  })
}
export function lsCommand(cfg: BayConfig, json = false) { log(json ? JSON.stringify(slotsData(cfg), null, 2) : renderSlots(cfg)) }
