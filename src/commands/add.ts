import fs from 'node:fs'
import path from 'node:path'
import { BayConfig, repoPath } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { slugify, worktreeDirName } from '../naming.js'
import { AddCtx, buildVars, bringUp, ensureStarted, ensureRuntime } from '../engine.js'
import { mainBranch } from '../git.js'
import { log } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

export interface AddPlan { service: string; slot: number; slug: string; dir: string; repo: string }
export function resolveAdd(cfg: BayConfig, feature: string, service: string, branch: string, description?: string): AddPlan {
  if (!cfg.services[service]) throw new Error(t(`未知服务「${service}」。运行 \`worktree-bay doctor\` 查看配置里有哪些服务。`, `unknown service "${service}". Run \`worktree-bay doctor\` to see configured services.`))
  const slot = claim(cfg, feature, { branch, description }); const slug = worktreeDirName(slot, slugify(branch))
  return { service, slot, slug, dir: path.join(repoPath(cfg, service), '.worktrees', slug), repo: repoPath(cfg, service) }
}
export async function addCommand(cfg: BayConfig, feature: string, service: string, branch?: string, base?: string, description?: string) {
  const br = branch || feature   // 默认分支 = 功能名
  await withLock(cfg.workspaceRoot, async () => {
    const p = resolveAdd(cfg, feature, service, br, description); const sp = cfg.services[service]
    const ctxBase = { cfg, service, sp, slot: p.slot, slug: p.slug, dir: p.dir, repo: p.repo }
    const ctx: AddCtx = { ...ctxBase, vars: buildVars(cfg, ctxBase) }
    if (fs.existsSync(p.dir)) {   // 幂等重入：worktree 已在 → 不重建，但「恢复运行体」（docker 容器 + dev server 都拉回来）
      log(c.bold(c.cyan(service)) + c.dim(t(`  ·  已就绪 · 槽 ${p.slot} · 端口 ${ctx.vars.port}`, `  ·  ready · slot ${p.slot} · port ${ctx.vars.port}`)))
      await ensureRuntime(ctx)
      return
    }
    log(c.bold(c.cyan(service)) + c.dim(t(`  ·  槽 ${p.slot} · 端口 ${ctx.vars.port} · 分支 ${br}`, `  ·  slot ${p.slot} · port ${ctx.vars.port} · branch ${br}`)))
    const resolvedBase = base ?? `origin/${mainBranch(p.repo)}`
    try {
      await bringUp(ctx, resolvedBase, br)
    } catch (e) {
      const m = String((e as Error).message)
      if (/not a valid branch name|cannot be used as a branch name/i.test(m))   // 分支名不合法（先于 base 判，二者都含 "not a valid"）
        throw new Error(t(`分支名「${br}」不合法：git 分支名不能以 / 开头或结尾、不能含 // 或 ..。换一个，如 fix/log（去掉前导斜杠）。`, `invalid branch name "${br}": git branch names can't start/end with "/" or contain "//" or "..". Use e.g. fix/log (no leading slash).`))
      if (/invalid reference|unknown revision|ambiguous argument|not a valid|Not a valid object name/i.test(m))
        throw new Error(t(`基分支「${resolvedBase}」无效（该仓可能没有 origin 或对应主分支）。给 add 显式传 base，例如：worktree-bay add ${feature} ${service} ${br} HEAD`, `invalid base ref "${resolvedBase}" (this repo may have no origin or main branch). Pass an explicit base to add, e.g.: worktree-bay add ${feature} ${service} ${br} HEAD`))
      throw e
    }
    await ensureStarted(ctx)
  })
}

// up: 一条命令为功能批量起多个服务（claim 自动 + 各服务默认分支）。每个服务由 addCommand 自己打印简洁标题。
export async function upCommand(cfg: BayConfig, feature: string, services: string[], base?: string, description?: string) {
  for (const service of services) await addCommand(cfg, feature, service, undefined, base, description)
}
