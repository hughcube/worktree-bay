import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { BayConfig, repoPath } from '../config.js'
import { log, warn } from '../util/log.js'

// 体检：git 是否可用、配置是否有效、各服务仓是否存在且是 git 仓。返回问题数。
export function doctor(cfg: BayConfig): number {
  let problems = 0
  const ok = (m: string) => log(`✓ ${m}`)
  const bad = (m: string) => { warn(`✗ ${m}`); problems++ }

  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0) ok('git 可用')
  else bad('git 不可用（worktree 依赖 git）')

  ok(`配置已加载并通过校验（${Object.keys(cfg.services).length} 个服务，槽位 1..${cfg.maxSlots}，端口 = 服务基址 + 槽号）`)

  for (const name of Object.keys(cfg.services)) {
    const repo = repoPath(cfg, name)
    if (!fs.existsSync(repo)) bad(`服务 ${name} 仓目录不存在: ${repo}`)
    else if (!fs.existsSync(path.join(repo, '.git'))) bad(`服务 ${name} 不是 git 仓: ${repo}`)
    else ok(`服务 ${name} → ${repo}`)
  }

  log(problems === 0 ? '\n✓ 一切正常' : `\n✗ 发现 ${problems} 个问题`)
  return problems
}
export function doctorCommand(cfg: BayConfig): void { if (doctor(cfg) > 0) process.exit(1) }
