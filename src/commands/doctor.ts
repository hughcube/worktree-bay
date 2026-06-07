import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { BayConfig, repoPath } from '../config.js'
import { log, warn } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

// 体检：git 是否可用、配置是否有效、各服务仓是否存在且是 git 仓。返回问题数。
export function doctor(cfg: BayConfig): number {
  let problems = 0
  const ok = (m: string) => log(`${c.green('✓')} ${m}`)
  const bad = (m: string) => { warn(`${c.red('✗')} ${m}`); problems++ }

  if (spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0) ok(t('git 可用', 'git available'))
  else bad(t('git 不可用（worktree 依赖 git，请先安装 git）', 'git not available (worktree needs git — install it first)'))

  ok(t(`配置已加载并通过校验（${Object.keys(cfg.services).length} 个服务，槽位 1..${cfg.maxSlots}，端口 = 服务基址 + 槽号）`, `config loaded and valid (${Object.keys(cfg.services).length} services, slots 1..${cfg.maxSlots}, port = service base + slot)`))

  for (const name of Object.keys(cfg.services)) {
    const repo = repoPath(cfg, name)
    if (!fs.existsSync(repo)) bad(t(`服务 ${name} 仓目录不存在: ${repo}（检查配置里的 workspaceRoot / repo，或先 git clone）`, `service ${name} repo dir missing: ${repo} (check workspaceRoot/repo in config, or clone it)`))
    else if (!fs.existsSync(path.join(repo, '.git'))) bad(t(`服务 ${name} 不是 git 仓: ${repo}（在该目录 git init 或 clone）`, `service ${name} is not a git repo: ${repo} (git init or clone there)`))
    else ok(`${t('服务', 'service')} ${name} → ${repo}`)
  }

  log(problems === 0 ? c.green(t('\n✓ 一切正常', '\n✓ all good')) : c.red(t(`\n✗ 发现 ${problems} 个问题`, `\n✗ found ${problems} problem(s)`)))
  return problems
}
export function doctorCommand(cfg: BayConfig): void { if (doctor(cfg) > 0) process.exit(1) }
