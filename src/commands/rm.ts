import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, slotOfFeature, removeLabel, Occupant } from '../slots.js'
import { buildVars } from '../engine.js'
import { isDirty, hasUnpushed, currentBranch, removeWorktree } from '../git.js'
import { runShellLive } from '../util/exec.js'
import { withProgress } from '../util/progress.js'
import { stopManaged } from '../proc.js'
import { log, warn } from '../util/log.js'
import { t } from '../i18n.js'

export function resolveRm(cfg: BayConfig, feature: string, service?: string): Occupant[] {
  const slot = slotOfFeature(cfg, feature); if (slot === undefined) throw new Error(t(`功能「${feature}」未占槽，无需拆除。用 \`worktree-bay ls\` 看在用的功能。`, `feature "${feature}" has no slot — nothing to tear down. See \`worktree-bay ls\`.`))
  const all = scanOccupancy(cfg).get(slot) ?? []; return service ? all.filter((o) => o.service === service) : all
}
export async function rmCommand(cfg: BayConfig, feature: string, service: string | undefined, force: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    let removed = 0
    const occs = resolveRm(cfg, feature, service)
    for (let i = 0; i < occs.length; i++) {
      const o = occs[i]; const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      const tag = t(`[${i + 1}/${occs.length}]`, `[${i + 1}/${occs.length}]`)
      if (!force && (isDirty(o.dir) || hasUnpushed(repo, branch))) { warn(t(`▶ ${tag} 跳过 ${o.service}：有未提交或未推送的改动。先提交/推送，或加 -f 强制删除（会丢这些改动）。`, `▶ ${tag} skipped ${o.service}: uncommitted or unpushed changes. Commit/push first, or pass -f to force-remove (discards them).`)); continue }
      log(t(`▶ ${tag} 拆除 ${o.service} …`, `▶ ${tag} removing ${o.service} …`))
      const stopped = stopManaged(cfg.workspaceRoot, o.dir)   // 先停 dev server（释放对 worktree 文件的占用）
      if (stopped) log(t(`  ▸ 已停止 dev server（pid ${stopped.pid}）`, `  ▸ stopped dev server (pid ${stopped.pid})`))
      const sp = cfg.services[o.service]
      if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot: o.slot, slug: o.slug, dir: o.dir, repo }); const cmd = renderTemplate(sp.teardown, vars); await runShellLive(cmd, { cwd: repo }, t(`teardown ${o.service}：${cmd}`, `teardown ${o.service}: ${cmd}`)) }
      await withProgress(t(`移除 ${o.service} 的 worktree`, `removing ${o.service} worktree`), () => removeWorktree(repo, o.dir, force))
      removed++
    }
    const slot = slotOfFeature(cfg, feature)!
    if (!service && (scanOccupancy(cfg).get(slot) ?? []).length === 0) {
      removeLabel(cfg, slot)
      if (removed === 0) log(t(`✓ 释放空槽预约 "${feature}"（槽 ${slot}）`, `✓ released empty slot reservation "${feature}" (slot ${slot})`))
    }
  })
}
