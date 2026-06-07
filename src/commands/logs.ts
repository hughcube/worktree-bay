import fs from 'node:fs'
import { BayConfig } from '../config.js'
import { scanOccupancy, slotOfFeature } from '../slots.js'
import { logPath, readLogTail } from '../proc.js'
import { log } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

// 看某功能各服务 dev server（配了 start 的）托管日志的尾部。排障 dev server 起不来/报错时用，
// 省得自己拼 .worktree-bay/logs/<slug>-<service>.log 路径再读整个大文件。
// 日志每次启动滚动（startDetached），当前文件只含本轮；--prev 看上一轮（.prev）。
export function logsCommand(cfg: BayConfig, feature: string, services: string[] = [], opts: { tail?: number; prev?: boolean } = {}) {
  for (const s of services) if (!cfg.services[s]) throw new Error(t(`未知服务「${s}」。运行 \`worktree-bay doctor\` 查看配置里有哪些服务。`, `unknown service "${s}". Run \`worktree-bay doctor\` to see configured services.`))
  const slot = slotOfFeature(cfg, feature)
  if (slot === undefined) { log(c.dim(t(`功能「${feature}」未占槽，没有可看的日志。`, `feature "${feature}" has no slot; no logs to show.`))); return }
  let occ = scanOccupancy(cfg).get(slot) ?? []
  if (services.length) occ = occ.filter((o) => services.includes(o.service))
  occ = occ.filter((o) => cfg.services[o.service].start)   // 只有配了 start 的服务才有托管日志
  if (!occ.length) { log(c.dim(t('没有可看日志的运行体（这些服务未配置 start dev server）。', 'no logs available (those services have no start dev server configured).'))); return }
  const tail = opts.tail ?? 40
  for (const o of occ) {
    const file = logPath(cfg.workspaceRoot, o.slug, o.service) + (opts.prev ? '.prev' : '')
    log(c.bold(c.cyan(o.service)) + c.dim('  ' + file))
    if (!fs.existsSync(file)) { log(c.dim(t(opts.prev ? '  （无上一轮日志）' : '  （暂无日志）', opts.prev ? '  (no previous-run log)' : '  (no log yet)'))); log(''); continue }
    const body = readLogTail(file, tail)
    log(body || c.dim(t('  （日志为空）', '  (log is empty)')))
    log('')
  }
}
