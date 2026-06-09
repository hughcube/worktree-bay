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

// services 为空 = 整功能；否则只这些服务。幂等：未占槽 / 指定服务当前未占用 → 返回空（no-op），
// 仅对「未知服务名」（typo，根本不在 config）报错。
export function resolveRm(cfg: BayConfig, feature: string, services: string[] = []): Occupant[] {
  for (const s of services) if (!cfg.services[s]) throw new Error(t(`未知服务「${s}」。运行 \`worktree-bay doctor\` 查看配置里有哪些服务。`, `unknown service "${s}". Run \`worktree-bay doctor\` to see configured services.`))
  const slot = slotOfFeature(cfg, feature)
  if (slot === undefined) return []
  const all = scanOccupancy(cfg).get(slot) ?? []
  return services.length ? all.filter((o) => services.includes(o.service)) : all
}
export async function rmCommand(cfg: BayConfig, feature: string, services: string[], force: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    const slot = slotOfFeature(cfg, feature)
    if (slot === undefined) { log(c.green('✓') + ' ' + t(`功能「${feature}」未占槽，无需拆除（已是目标状态）`, `feature "${feature}" has no slot — nothing to tear down (already in target state)`)); return }
    let removed = 0
    const wholeFeature = services.length === 0
    const occs = resolveRm(cfg, feature, services)
    // 指定了服务但没占用 → no-op。整功能（未指定服务）即使无 worktree 也要继续，去释放空槽预约。
    if (occs.length === 0 && !wholeFeature) { log(c.dim(t('指定服务当前未占用，无需拆除（已是目标状态）', 'those services aren\'t occupied — nothing to tear down (already in target state)'))); return }
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
    if (wholeFeature && (scanOccupancy(cfg).get(slot) ?? []).length === 0) {
      removeLabel(cfg, slot)
      if (removed === 0) log(`${c.green('✓')} ` + t(`释放空槽预约 "${feature}"（槽 ${slot}）`, `released empty slot reservation "${feature}" (slot ${slot})`))
    }
  })
}
