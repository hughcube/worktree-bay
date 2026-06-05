import { BayConfig, repoPath, renderTemplate } from '../config.js'
import { withLock } from '../lock.js'
import { scanOccupancy, pruneEmptyLabels, removeLabel } from '../slots.js'
import { buildVars } from '../engine.js'
import { currentBranch, isDirty, hasUnpushed, isMergedToMain, remoteBranchGone, removeWorktree } from '../git.js'
import { runShell } from '../util/exec.js'
import { log, warn } from '../util/log.js'

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
        log(`[gc] ${o.service} (slot ${slot}) 已合并且干净 → 移除`)
        if (apply) { const sp = cfg.services[o.service]; if (sp.teardown) { const vars = buildVars(cfg, { cfg, service: o.service, sp, slot, slug: o.slug, dir: o.dir, repo }); runShell(renderTemplate(sp.teardown, vars), { cwd: repo }) } removeWorktree(repo, o.dir, false) }
      } else if (v === 'flag') warn(`[gc] ${o.service} (slot ${slot}) 已合并但脏/未推 → 跳过，确认后手动删`)
      else if (remoteBranchGone(repo, branch)) warn(`[gc] ${o.service} (slot ${slot}) 远端分支已删（疑似 squash）→ 确认后 bay rm`)
    }
    for (const { slot, feature } of pruneEmptyLabels(cfg)) { log(`[gc] 槽 ${slot}（${feature}）空预约（无 worktree）`); if (apply) removeLabel(cfg, slot) }
    if (!apply) log('（dry-run；加 --apply 执行 auto-remove 与空预约清理）')
  })
}
