import { BayConfig, repoPath } from '../config.js'
import { scanOccupancy, slotOfFeature, Occupant } from '../slots.js'
import { buildVars, execArgv, run } from '../engine.js'
import { log } from '../util/log.js'
import { t } from '../i18n.js'

function occupantOf(cfg: BayConfig, feature: string, service: string): Occupant {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error(t(`功能「${feature}」未占槽。先 \`worktree-bay up ${feature} <服务...>\` 起它，再用 \`worktree-bay ls\` 确认。`, `feature "${feature}" hasn't claimed a slot. Run \`worktree-bay up ${feature} <services...>\` first, then check \`worktree-bay ls\`.`))
  const occ = (scanOccupancy(cfg).get(slot) ?? []).find((o) => o.service === service); if (!occ) throw new Error(t(`服务「${service}」不在功能「${feature}」里。先 \`worktree-bay add ${feature} ${service}\`，或用 \`worktree-bay ls\` 看已起的服务。`, `service "${service}" is not in feature "${feature}". Run \`worktree-bay add ${feature} ${service}\` first, or see \`worktree-bay ls\`.`))
  return occ
}
function ctxOf(cfg: BayConfig, feature: string, service: string) {
  const occ = occupantOf(cfg, feature, service)
  const sp = cfg.services[service]
  return { sp, vars: buildVars(cfg, { cfg, service, sp, slot: occ.slot, slug: occ.slug, dir: occ.dir, repo: repoPath(cfg, service) }) }
}
export function pathCommand(cfg: BayConfig, feature: string, service: string) {
  log(occupantOf(cfg, feature, service).dir)
}
export function runCommand(cfg: BayConfig, feature: string, service: string, name: string, args: string[]) {
  const ctx = ctxOf(cfg, feature, service); const named = ctx.sp.run?.[name]; if (!named) throw new Error(t(`服务 ${service} 没有定义 run.${name}。在 worktree-bay.config.json 里该服务的 "run" 下加一条，如 "run": { "${name}": ["echo", "hi"] }。`, `service ${service} has no run.${name}. Add it under that service's "run" in worktree-bay.config.json, e.g. "run": { "${name}": ["echo", "hi"] }.`))
  const argv = execArgv(ctx, [...named, ...args]); process.exit(run(argv[0], argv.slice(1)).code)
}
export function shCommand(cfg: BayConfig, feature: string, service: string) {
  const ctx = ctxOf(cfg, feature, service); const argv = execArgv(ctx, ['sh']); process.exit(run(argv[0], argv.slice(1)).code)
}
