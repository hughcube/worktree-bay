import { BayConfig, repoPath } from '../config.js'
import { scanOccupancy, slotOfFeature } from '../slots.js'
import { buildVars, execArgv, run } from '../engine.js'

function ctxOf(cfg: BayConfig, feature: string, service: string) {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error('unknown feature: ' + feature)
  const occ = (scanOccupancy(cfg).get(slot) ?? []).find((o) => o.service === service); if (!occ) throw new Error(`${service} not in ${feature}`)
  const sp = cfg.services[service]
  return { sp, vars: buildVars(cfg, { cfg, service, sp, slot, slug: occ.slug, dir: occ.dir, repo: repoPath(cfg, service) }) }
}
export function runCommand(cfg: BayConfig, feature: string, service: string, name: string, args: string[]) {
  const ctx = ctxOf(cfg, feature, service); const named = ctx.sp.run?.[name]; if (!named) throw new Error(`run.${name} 未定义于 ${service}`)
  const argv = execArgv(ctx, [...named, ...args]); process.exit(run(argv[0], argv.slice(1)).code)
}
export function shCommand(cfg: BayConfig, feature: string, service: string) {
  const ctx = ctxOf(cfg, feature, service); const argv = execArgv(ctx, ['sh']); process.exit(run(argv[0], argv.slice(1)).code)
}
