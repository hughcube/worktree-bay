import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, removeLabel, Occupant } from '../slots.js'
import { buildVars } from '../engine.js'
import { isDirty, hasUnpushed, currentBranch, removeWorktree } from '../git.js'
import { runShellLive } from '../util/exec.js'
import { withProgress } from '../util/progress.js'
import { stopManaged } from '../proc.js'
import { log, warn } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

// services 为空 = 整功能；否则只这些服务（顺带校验服务名确实在该功能里）
export function resolveRm(cfg: BayConfig, feature: string, services: string[] = []): Occupant[] {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error(t(`功能「${feature}」未占槽，无需拆除。用 \`worktree-bay ls\` 看在用的功能。`, `feature "${feature}" has no slot — nothing to tear down. See \`worktree-bay ls\`.`))
  const all = scanOccupancy(cfg).get(slot) ?? []
  if (!services.length) return all
  for (const s of services) if (!all.some((o) => o.service === s)) throw new Error(t(`服务「${s}」不在功能「${feature}」里。用 \`worktree-bay ls\` 看已起的服务。`, `service "${s}" is not in feature "${feature}". See \`worktree-bay ls\`.`))
  return all.filter((o) => services.includes(o.service))
}
export async function rmCommand(cfg: BayConfig, feature: string, services: string[], force: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    let removed = 0
    const wholeFeature = services.length === 0
    const occs = resolveRm(cfg, feature, services)
    for (const o of occs) {
      const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      if (!force && (isDirty(o.dir) || hasUnpushed(repo, branch))) { warn(c.yellow(t(`${o.service}  ·  跳过：有未提交或未推送的改动。先提交/推送，或加 -f 强删（会丢改动）。`, `${o.service}  ·  skipped: uncommitted or unpushed changes. Commit/push first, or pass -f to force-remove (discards them).`))); continue }
      log(c.bold(c.cyan(o.service)) + c.dim(t('  ·  拆除…', '  ·  tearing down…')))
      const stopped = stopManaged(cfg.workspaceRoot, o.dir)   // 先停 dev server（释放对 worktree 文件的占用）
      if (stopped) log(`  ${c.green('✓')} ` + t(`已停止 dev server（pid ${stopped.pid}）`, `stopped dev server (pid ${stopped.pid})`))
      const sp = cfg.services[o.service]
      if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot: o.slot, slug: o.slug, dir: o.dir, repo }); const cmd = renderTemplate(sp.teardown, vars); await runShellLive(cmd, { cwd: repo }, t(`teardown ${o.service}：${cmd}`, `teardown ${o.service}: ${cmd}`)) }
      await withProgress(t(`移除 ${o.service} 的 worktree`, `removing ${o.service} worktree`), () => removeWorktree(repo, o.dir, force))
      removed++
    }
    const slot = slotOfFeature(cfg, feature)!
    if (wholeFeature && (scanOccupancy(cfg).get(slot) ?? []).length === 0) {
      removeLabel(cfg, slot)
      if (removed === 0) log(`${c.green('✓')} ` + t(`释放空槽预约 "${feature}"（槽 ${slot}）`, `released empty slot reservation "${feature}" (slot ${slot})`))
    }
  })
}
