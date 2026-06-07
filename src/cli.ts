#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { loadConfig, BayConfig } from './config.js'
import { claimCommand } from './commands/claim.js'
import { lsCommand } from './commands/ls.js'
import { addCommand, upCommand } from './commands/add.js'
import { runCommand, shCommand, pathCommand } from './commands/passthrough.js'
import { rmCommand } from './commands/rm.js'
import { startCommand, stopCommand, restartCommand } from './commands/lifecycle.js'
import { gcCommand } from './commands/gc.js'
import { doctorCommand } from './commands/doctor.js'
import { complete, completionCommand, installCompletion } from './commands/completion.js'
import { startMcp } from './mcp.js'
import { readSkill } from './skill.js'
import { initCommand } from './commands/init.js'
import { die, log } from './util/log.js'
import { t } from './i18n.js'
import { friendlyParseError } from './util/clierr.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
const program = new Command()
program.name('worktree-bay').description(t('worktree 槽位 + 端口编排器：多服务并行开发利器', 'Per-feature git worktree + port slot orchestrator for parallel multi-service development')).version(pkg.version)
program.addHelpText('after', t(`
示例:
  worktree-bay init                      在当前工作区生成配置（扫描子 git 仓预填服务）
  worktree-bay up drill-fix api lms      一条命令为功能起 api+lms（分支默认 = 功能名）
  worktree-bay ls                        看所有功能/端口占用
  worktree-bay run drill-fix api test    在 api 跑 run.test
  worktree-bay down drill-fix            拆除整个功能
  worktree-bay gc                        回收已合并的功能（默认 dry-run）

更多: worktree-bay skill（完整使用与配置指南） · worktree-bay help <命令>（单命令帮助）`, `
Examples:
  worktree-bay init                      scaffold config here (scans child git repos)
  worktree-bay up drill-fix api lms      bring up api+lms for a feature (branch defaults to feature name)
  worktree-bay ls                        list all features / port usage
  worktree-bay run drill-fix api test    run run.test inside api
  worktree-bay down drill-fix            tear down the whole feature
  worktree-bay gc                        reclaim merged features (dry-run by default)

More: worktree-bay skill (full usage & config guide) · worktree-bay help <command>`))
const sync = (fn: (c: BayConfig) => void) => { try { fn(loadConfig(process.cwd())) } catch (e) { die((e as Error).message) } }

program.command('init').description(t('在当前工作区生成 worktree-bay.config.json（扫描子 git 仓预填服务）', 'scaffold worktree-bay.config.json here (scans child git repos to prefill services)'))
  .action(() => { try { initCommand(process.cwd()) } catch (e) { die((e as Error).message) } })
program.command('claim <feature>').description(t('为功能占一个槽位（打印各服务在该槽的端口）', 'claim a slot for a feature (prints each service\'s port in that slot)'))
  .action(async (f) => { try { await claimCommand(loadConfig(process.cwd()), f) } catch (e) { die((e as Error).message) } })
program.command('ls').description(t('列出所有槽位与占用状态', 'list all slots and their occupancy')).option('--json', t('以 JSON 输出（含 worktree 路径，便于脚本/AI 消费）', 'output JSON (includes worktree paths, for scripts/AI)'))
  .action((o) => sync((c) => lsCommand(c, !!o.json)))
program.command('path <feature> <service>').description(t('打印某功能某服务的 worktree 绝对路径（可 cd $(...)）', 'print the absolute worktree path for a feature\'s service (cd $(...))'))
  .action((f, s) => sync((c) => pathCommand(c, f, s)))
program.command('doctor').description(t('体检：git/配置/各服务仓是否就绪', 'health check: git / config / each service repo readiness'))
  .action(() => sync(doctorCommand))
program.command('up <feature> <services...>').description(t('一条命令为功能起多个服务（自动 claim + 各服务默认分支 = 功能名）', 'bring up multiple services for a feature (auto-claim + branch defaults to feature name)'))
  .action(async (f, services) => { try { await upCommand(loadConfig(process.cwd()), f, services) } catch (e) { die((e as Error).message) } })
program.command('add <feature> <service> [branch] [base]').description(t('为功能在某服务开 worktree（branch 默认 = 功能名）', 'open a worktree for a feature on one service (branch defaults to feature name)'))
  .action(async (f, s, b, base) => { try { await addCommand(loadConfig(process.cwd()), f, s, b, base) } catch (e) { die((e as Error).message) } })
program.command('run <feature> <service> <name> [args...]').description(t('在服务运行体里跑 run.<name> 命令（透传 args）', 'run the configured run.<name> command inside a service (passes args through)'))
  .action((f, s, n, args) => sync((c) => runCommand(c, f, s, n, args ?? [])))
program.command('sh <feature> <service>').description(t('进入服务运行体的 shell', 'open a shell inside the service runtime'))
  .action((f, s) => sync((c) => shCommand(c, f, s)))
program.command('start <feature> [service]').description(t('启动该功能的 dev server（worktree 已在，只起 start 进程，不动 worktree）', 'start the feature\'s dev server(s) (worktree already exists; runs the start process only)'))
  .action(async (f, s) => { try { await startCommand(loadConfig(process.cwd()), f, s) } catch (e) { die((e as Error).message) } })
program.command('stop <feature> [service]').description(t('停止该功能的 dev server（保留 worktree）', 'stop the feature\'s dev server(s) (keeps the worktree)'))
  .action(async (f, s) => { try { await stopCommand(loadConfig(process.cwd()), f, s) } catch (e) { die((e as Error).message) } })
program.command('restart <feature> [service]').description(t('重启该功能的 dev server（停掉再起）', 'restart the feature\'s dev server(s) (stop then start)'))
  .action(async (f, s) => { try { await restartCommand(loadConfig(process.cwd()), f, s) } catch (e) { die((e as Error).message) } })
program.command('down <feature>').description(t('拆除整个功能的所有服务 worktree（= rm <feature>）', 'tear down all of a feature\'s service worktrees (= rm <feature>)')).option('-f, --force', t('跳过脏/未推检查强制删除', 'skip dirty/unpushed checks and force-remove'))
  .action(async (f, o) => { try { await rmCommand(loadConfig(process.cwd()), f, undefined, !!o.force) } catch (e) { die((e as Error).message) } })
program.command('rm <feature> [service]').description(t('拆除某服务或整槽的 worktree（默认查脏/未推保护）', 'remove one service\'s or the whole slot\'s worktree (dirty/unpushed protected by default)')).option('-f, --force', t('跳过脏/未推检查强制删除', 'skip dirty/unpushed checks and force-remove'))
  .action(async (f, s, o) => { try { await rmCommand(loadConfig(process.cwd()), f, s, !!o.force) } catch (e) { die((e as Error).message) } })
program.command('gc').description(t('合并感知回收（默认 dry-run）', 'merge-aware reclaim (dry-run by default)')).option('--apply', t('实际执行回收', 'actually perform the reclaim'))
  .action(async (o) => { try { await gcCommand(loadConfig(process.cwd()), !!o.apply) } catch (e) { die((e as Error).message) } })
program.command('completion <target> [shell]').description(t('install 一键装进 shell；或 bash|zsh|fish 打印补全脚本', 'install: set up shell completion; or bash|zsh|fish: print the completion script'))
  .action((target, shell) => { try { if (target === 'install') installCompletion(shell); else completionCommand(target) } catch (e) { die((e as Error).message) } })
program.command('mcp').description(t('启动 MCP 服务（stdio，轻量脚本，客户端按需 spawn），供 AI 调用 worktree-bay', 'start the MCP server (stdio, lightweight, spawned on demand) for AI agents'))
  .action(() => { try { startMcp() } catch (e) { die((e as Error).message) } })
program.command('skill').description(t('打印 worktree-bay 使用与配置完全指南', 'print the full worktree-bay usage & config guide'))
  .action(() => { try { log(readSkill()) } catch (e) { die((e as Error).message) } })
program.command('version').description(t('显示版本号', 'show the version number')).action(() => log(pkg.version))
program.command('__complete', { hidden: true }).allowUnknownOption().action(() => {
  const words = process.argv.slice(process.argv.indexOf('--') + 1)
  let cfg: BayConfig | null = null
  try { cfg = loadConfig(process.cwd()) } catch { /* 无配置：仍补全子命令，只是补不了 feature/service */ }
  try { console.log(complete(cfg, words).join('\n')) } catch { /* 静默 */ }
})

// 把 commander 的英文解析错误（missing required argument 等）重写为自然语言（中/英）+ 用法 + 建议。
// 走 configureOutput.writeErr（会被子命令继承）而非 exitOverride+catch（子命令上不可靠）。
program.showSuggestionAfterError(false)
program.configureOutput({
  writeErr: (str) => {
    const sub = program.commands.find((c) => c.name() === process.argv[2])
    process.stderr.write('worktree-bay: ' + friendlyParseError(str, sub ? { name: sub.name(), usage: sub.usage(), description: sub.description() } : undefined) + '\n')
  },
})
program.parseAsync(process.argv).catch((e) => die((e as Error).message))
