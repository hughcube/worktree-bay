import { BayConfig, repoPath } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, Occupant } from '../slots.js'
import { buildVars, ensureRuntime, stopRuntime, AddCtx } from '../engine.js'
import { portInUse } from '../ports.js'
import { log } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

// dev server + infra 生命周期：stop/start/restart 同时管 node（managed 进程）与 docker（stop 钩子 + setup 恢复），不动 worktree。
// services 为空 = 整功能；否则只这些服务
function occupantsOf(cfg: BayConfig, feature: string, services: string[] = []): Occupant[] {
  const slot = slotOfFeature(cfg, feature)
  if (slot === undefined) throw new Error(t(`功能「${feature}」未占槽。先 \`worktree-bay up ${feature} <服务...>\` 起它。`, `feature "${feature}" hasn't claimed a slot. Run \`worktree-bay up ${feature} <services...>\` first.`))
  const all = scanOccupancy(cfg).get(slot) ?? []
  if (!services.length) return all
  for (const s of services) if (!all.some((o) => o.service === s)) throw new Error(t(`服务「${s}」不在功能「${feature}」里。用 \`worktree-bay ls\` 看已起的服务。`, `service "${s}" is not in feature "${feature}". See \`worktree-bay ls\`.`))
  return all.filter((o) => services.includes(o.service))
}
function ctxOf(cfg: BayConfig, o: Occupant): AddCtx {
  const base = { cfg, service: o.service, sp: cfg.services[o.service], slot: o.slot, slug: o.slug, dir: o.dir, repo: repoPath(cfg, o.service) }
  return { ...base, vars: buildVars(cfg, base) }
}
// 该服务是否有「可停起的运行体」：managed dev server(start) 或可停的 infra(stop 钩子)
const hasRuntime = (cfg: BayConfig, service: string): boolean => { const sp = cfg.services[service]; return !!(sp.start || sp.stop) }

export async function stopCommand(cfg: BayConfig, feature: string, services: string[] = []) {
  await withLock(cfg.workspaceRoot, async () => {
    let any = false
    for (const o of occupantsOf(cfg, feature, services)) { if (!hasRuntime(cfg, o.service)) continue; any = true; log(c.bold(c.cyan(o.service))); await stopRuntime(ctxOf(cfg, o)) }
    if (!any) log(t('没有可停止的运行体（相关服务未配置 start/stop）', 'nothing to stop (no start/stop configured for those services)'))
  })
}
export async function startCommand(cfg: BayConfig, feature: string, services: string[] = []) {
  await withLock(cfg.workspaceRoot, async () => {
    let any = false
    for (const o of occupantsOf(cfg, feature, services)) { if (!hasRuntime(cfg, o.service)) continue; any = true; log(c.bold(c.cyan(o.service))); await ensureRuntime(ctxOf(cfg, o)) }
    if (!any) log(t('没有可启动的运行体（相关服务未配置 start/stop）', 'nothing to start (no start/stop configured for those services)'))
  })
}
export async function restartCommand(cfg: BayConfig, feature: string, services: string[] = []) {
  await withLock(cfg.workspaceRoot, async () => {
    for (const o of occupantsOf(cfg, feature, services)) {
      if (!hasRuntime(cfg, o.service)) continue
      const ctx = ctxOf(cfg, o)
      log(c.bold(c.cyan(o.service)) + c.dim(t('  ·  重启…', '  ·  restarting…')))
      await stopRuntime(ctx)
      if (cfg.services[o.service].start) { const port = Number(ctx.vars.port); for (let i = 0; i < 40 && (await portInUse(port)); i++) await new Promise((r) => setTimeout(r, 100)) }   // 等端口释放
      await ensureRuntime(ctx)
    }
  })
}
