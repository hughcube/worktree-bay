import path from 'node:path'
import { BayConfig, repoPath } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { slugify, worktreeDirName } from '../naming.js'
import { AddCtx, buildVars, bringUp } from '../engine.js'
import { mainBranch } from '../git.js'
import { log } from '../util/log.js'

export interface AddPlan { service: string; slot: number; slug: string; dir: string; repo: string }
export function resolveAdd(cfg: BayConfig, feature: string, service: string, branch: string): AddPlan {
  if (!cfg.services[service]) throw new Error('unknown service: ' + service)
  const slot = claim(cfg, feature); const slug = worktreeDirName(slot, slugify(branch))
  return { service, slot, slug, dir: path.join(repoPath(cfg, service), '.worktrees', slug), repo: repoPath(cfg, service) }
}
export async function addCommand(cfg: BayConfig, feature: string, service: string, branch?: string, base?: string) {
  const br = branch || feature   // 默认分支 = 功能名
  await withLock(cfg.workspaceRoot, async () => {
    const p = resolveAdd(cfg, feature, service, br); const sp = cfg.services[service]
    const ctxBase = { cfg, service, sp, slot: p.slot, slug: p.slug, dir: p.dir, repo: p.repo }
    const ctx: AddCtx = { ...ctxBase, vars: buildVars(cfg, ctxBase) }
    await bringUp(ctx, base ?? `origin/${mainBranch(p.repo)}`, br)
    log(`✓ ${service} 挂入 "${feature}"（槽 ${p.slot}，端口 ${ctx.vars.port}，分支 ${br}）`)
  })
}

// up: 一条命令为功能批量起多个服务（claim 自动 + 各服务默认分支）
export async function upCommand(cfg: BayConfig, feature: string, services: string[], base?: string) {
  for (const service of services) await addCommand(cfg, feature, service, undefined, base)
}
