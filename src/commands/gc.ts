import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, pruneEmptyLabels, removeLabel } from '../slots.js'
import { buildVars } from '../engine.js'
import { currentBranch, isDirty, hasUnpushed, isMergedToMain, remoteBranchGone, removeWorktree } from '../git.js'
import { runShellLive } from '../util/exec.js'
import { withProgress } from '../util/progress.js'
import { stopManaged } from '../proc.js'
import { log, warn } from '../util/log.js'
import { t } from '../i18n.js'

export type Verdict = 'auto-remove' | 'flag' | 'keep'
export function classifyForGc(s: { merged: boolean; dirty: boolean; unpushed: boolean }): Verdict {
  if (s.merged && !s.dirty && !s.unpushed) return 'auto-remove'
  if (s.merged) return 'flag'
  return 'keep'
}
export async function gcCommand(cfg: BayConfig, apply: boolean) {
  await withLock(cfg.workspaceRoot, async () => {
    for (const [slot, occupants] of scanOccupancy(cfg)) for (const o of occupants) {
      const repo = repoPath(cfg, o.service); const branch = currentBranch(o.dir)
      const v = classifyForGc({ merged: isMergedToMain(repo, branch), dirty: isDirty(o.dir), unpushed: hasUnpushed(repo, branch) })
      if (v === 'auto-remove') {
        log(t(`[gc] ${o.service} (槽 ${slot}) 已合并且干净 → 移除`, `[gc] ${o.service} (slot ${slot}) merged & clean → remove`))
        if (apply) { stopManaged(cfg.workspaceRoot, o.dir); const sp = cfg.services[o.service]; if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot, slug: o.slug, dir: o.dir, repo }); const cmd = renderTemplate(sp.teardown, vars); await runShellLive(cmd, { cwd: repo }, t(`teardown ${o.service}：${cmd}`, `teardown ${o.service}: ${cmd}`)) } await withProgress(t(`移除 ${o.service} 的 worktree`, `removing ${o.service} worktree`), () => removeWorktree(repo, o.dir, false)) }
      } else if (v === 'flag') warn(t(`[gc] ${o.service} (槽 ${slot}) 已合并但有脏/未推改动 → 跳过；确认无误后用 \`worktree-bay rm ${o.slug.replace(/^s\d+-/, '')} ${o.service} -f\` 删`, `[gc] ${o.service} (slot ${slot}) merged but dirty/unpushed → skipped; once sure, remove with \`worktree-bay rm <feature> ${o.service} -f\``))
      else if (remoteBranchGone(repo, branch)) warn(t(`[gc] ${o.service} (槽 ${slot}) 远端分支已删（疑似 squash 合并）→ 确认后用 \`worktree-bay down <功能>\` 拆`, `[gc] ${o.service} (slot ${slot}) remote branch gone (likely squash-merged) → once sure, tear down with \`worktree-bay down <feature>\``))
    }
    for (const { slot, feature } of pruneEmptyLabels(cfg)) { log(t(`[gc] 槽 ${slot}（${feature}）是空预约（无 worktree）`, `[gc] slot ${slot} (${feature}) is an empty reservation (no worktree)`)); if (apply) removeLabel(cfg, slot) }
    if (!apply) log(t('（dry-run；加 --apply 才真正执行 auto-remove 与空预约清理）', '(dry-run; pass --apply to actually perform auto-remove and clear empty reservations)'))
  })
}
