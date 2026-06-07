import { BayConfig, repoPath } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, Occupant } from '../slots.js'
import { buildVars, ensureStarted, AddCtx } from '../engine.js'
import { stopManaged } from '../proc.js'
import { portInUse } from '../ports.js'
import { log, warn } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

// dev server 生命周期：start/stop/restart（只管 start 配置起的进程，不动 worktree）
function occupantsOf(cfg: BayConfig, feature: string, service?: string): Occupant[] {
  const slot = slotOfFeature(cfg, feature)
  if (slot === undefined) throw new Error(t(`功能「${feature}」未占槽。先 \`worktree-bay up ${feature} <服务...>\` 起它。`, `feature "${feature}" hasn't claimed a slot. Run \`worktree-bay up ${feature} <services...>\` first.`))
  const all = scanOccupancy(cfg).get(slot) ?? []
  return service ? all.filter((o) => o.service === service) : all
}
function ctxOf(cfg: BayConfig, o: Occupant): AddCtx {
  const sp = cfg.services[o.service]
  const base = { cfg, service: o.service, sp, slot: o.slot, slug: o.slug, dir: o.dir, repo: repoPath(cfg, o.service) }
  return { ...base, vars: buildVars(cfg, base) }
}

export async function startCommand(cfg: BayConfig, feature: string, service?: string) {
  await withLock(cfg.workspaceRoot, async () => {
    let any = false
    for (const o of occupantsOf(cfg, feature, service)) {
      if (!cfg.services[o.service].start) continue
      any = true
      log(c.bold(c.cyan(o.service)))
      await ensureStarted(ctxOf(cfg, o))
    }
    if (!any) warn(t('没有可启动的 dev server（相关服务未配置 start）', 'nothing to start (those services have no start configured)'))
  })
}

export async function stopCommand(cfg: BayConfig, feature: string, service?: string) {
  await withLock(cfg.workspaceRoot, async () => {
    let any = false
    for (const o of occupantsOf(cfg, feature, service)) {
      const stopped = stopManaged(cfg.workspaceRoot, o.dir)
      if (stopped) { any = true; log(`${c.green('✓')} ` + t(`已停止 ${o.service} dev server（pid ${stopped.pid}）`, `stopped ${o.service} dev server (pid ${stopped.pid})`)) }
    }
    if (!any) log(t('没有在跑的 dev server', 'no running dev server'))
  })
}

export async function restartCommand(cfg: BayConfig, feature: string, service?: string) {
  await withLock(cfg.workspaceRoot, async () => {
    for (const o of occupantsOf(cfg, feature, service)) {
      const sp = cfg.services[o.service]
      if (!sp.start) continue
      log(c.bold(c.cyan(o.service)) + c.dim(t('  ·  重启…', '  ·  restarting…')))
      stopManaged(cfg.workspaceRoot, o.dir)
      const port = Number(ctxOf(cfg, o).vars.port)
      for (let i = 0; i < 40 && (await portInUse(port)); i++) await new Promise((r) => setTimeout(r, 100))  // 等端口释放（最多 ~4s）
      await ensureStarted(ctxOf(cfg, o))
    }
  })
}
