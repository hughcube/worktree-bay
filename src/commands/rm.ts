import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, removeLabel, Occupant } from '../slots.js'
import { buildVars } from '../engine.js'
import { isDirty, hasUnpushed, currentBranch, removeWorktree } from '../git.js'
import { runShellLive } from '../util/exec.js'
import { log, warn } from '../util/log.js'
import { t } from '../i18n.js'

export function resolveRm(cfg: BayConfig, feature: string, service?: string): Occupant[] {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error(t(`功能「${feature}」未占槽，无需拆除。用 \`worktree-bay ls\` 看在用的功能。`, `feature "${feature}" has no slot — nothing to tear down. See \`worktree-bay ls\`.`))
  const all = scanOccupancy(cfg).get(slot) ?? []; return service ? all.filter((o) => o.service === service) : all
}
export async function rmCommand(cfg: BayConfig, feature: string, service: string | undefined, force: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    let removed = 0
    for (const o of resolveRm(cfg, feature, service)) {
      const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      if (!force && (isDirty(o.dir) || hasUnpushed(repo, branch))) { warn(t(`跳过 ${o.service}：有未提交或未推送的改动。先提交/推送，或加 -f 强制删除（会丢这些改动）。`, `skipped ${o.service}: it has uncommitted or unpushed changes. Commit/push first, or pass -f to force-remove (discards them).`)); continue }
      const sp = cfg.services[o.service]
      if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot: o.slot, slug: o.slug, dir: o.dir, repo }); const cmd = renderTemplate(sp.teardown, vars); await runShellLive(cmd, { cwd: repo }, t(`teardown ${o.service}：${cmd}`, `teardown ${o.service}: ${cmd}`)) }
      removeWorktree(repo, o.dir, force); log(t(`✓ 移除 ${o.service}`, `✓ removed ${o.service}`)); removed++
    }
    const slot = slotOfFeature(cfg, feature)!
    if (!service && (scanOccupancy(cfg).get(slot) ?? []).length === 0) {
      removeLabel(cfg, slot)
      if (removed === 0) log(t(`✓ 释放空槽预约 "${feature}"（槽 ${slot}）`, `✓ released empty slot reservation "${feature}" (slot ${slot})`))
    }
  })
}
