import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, removeLabel, Occupant } from '../slots.js'
import { buildVars } from '../engine.js'
import { isDirty, hasUnpushed, currentBranch, removeWorktree } from '../git.js'
import { runShell } from '../util/exec.js'
import { log, warn } from '../util/log.js'

export function resolveRm(cfg: BayConfig, feature: string, service?: string): Occupant[] {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error('unknown feature: ' + feature)
  const all = scanOccupancy(cfg).get(slot) ?? []; return service ? all.filter((o) => o.service === service) : all
}
export async function rmCommand(cfg: BayConfig, feature: string, service: string | undefined, force: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    let removed = 0
    for (const o of resolveRm(cfg, feature, service)) {
      const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      if (!force && (isDirty(o.dir) || hasUnpushed(repo, branch))) { warn(`跳过 ${o.service}：有未提交/未推改动（-f 强删）`); continue }
      const sp = cfg.services[o.service]
      if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot: o.slot, slug: o.slug, dir: o.dir, repo }); runShell(renderTemplate(sp.teardown, vars), { cwd: repo }) }
      removeWorktree(repo, o.dir, force); log(`✓ 移除 ${o.service}`); removed++
    }
    const slot = slotOfFeature(cfg, feature)!
    if (!service && (scanOccupancy(cfg).get(slot) ?? []).length === 0) {
      removeLabel(cfg, slot)
      if (removed === 0) log(`✓ 释放空槽预约 "${feature}"（槽 ${slot}）`)
    }
  })
}
