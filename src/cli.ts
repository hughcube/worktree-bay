#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { loadConfig, BayConfig } from './config.js'
import { claimCommand } from './commands/claim.js'
import { lsCommand } from './commands/ls.js'
import { addCommand, upCommand } from './commands/add.js'
import { runCommand, shCommand, pathCommand } from './commands/passthrough.js'
import { rmCommand } from './commands/rm.js'
import { gcCommand } from './commands/gc.js'
import { doctorCommand } from './commands/doctor.js'
import { complete, completionCommand, installCompletion } from './commands/completion.js'
import { startMcp } from './mcp.js'
import { readSkill } from './skill.js'
import { initCommand } from './commands/init.js'
import { die, log } from './util/log.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
const program = new Command()
program.name('worktree-bay').description('worktree 槽位 + 端口编排器：多服务并行开发利器').version(pkg.version)
program.addHelpText('after', `
示例:
  worktree-bay init                      在当前工作区生成配置（扫描子 git 仓预填服务）
  worktree-bay up drill-fix api lms      一条命令为功能起 api+lms（分支默认 = 功能名）
  worktree-bay ls                        看所有功能/端口占用
  worktree-bay run drill-fix api test    在 api 跑 run.test
  worktree-bay down drill-fix            拆除整个功能
  worktree-bay gc                        回收已合并的功能（默认 dry-run）

更多: worktree-bay skill（完整使用与配置指南） · worktree-bay help <命令>（单命令帮助）`)
const sync = (fn: (c: BayConfig) => void) => { try { fn(loadConfig(process.cwd())) } catch (e) { die((e as Error).message) } }

program.command('init').description('在当前工作区生成 worktree-bay.config.json（扫描子 git 仓预填服务）')
  .action(() => { try { initCommand(process.cwd()) } catch (e) { die((e as Error).message) } })
program.command('claim <feature>').description('为功能占一个槽位（打印各服务在该槽的端口）')
  .action(async (f) => { try { await claimCommand(loadConfig(process.cwd()), f) } catch (e) { die((e as Error).message) } })
program.command('ls').description('列出所有槽位与占用状态').option('--json', '以 JSON 输出（含 worktree 路径，便于脚本/AI 消费）')
  .action((o) => sync((c) => lsCommand(c, !!o.json)))
program.command('path <feature> <service>').description('打印某功能某服务的 worktree 绝对路径（可 cd $(...)）')
  .action((f, s) => sync((c) => pathCommand(c, f, s)))
program.command('doctor').description('体检：git/配置/各服务仓是否就绪')
  .action(() => sync(doctorCommand))
program.command('up <feature> <services...>').description('一条命令为功能起多个服务（自动 claim + 各服务默认分支 = 功能名）')
  .action(async (f, services) => { try { await upCommand(loadConfig(process.cwd()), f, services) } catch (e) { die((e as Error).message) } })
program.command('add <feature> <service> [branch] [base]').description('为功能在某服务开 worktree（branch 默认 = 功能名）')
  .action(async (f, s, b, base) => { try { await addCommand(loadConfig(process.cwd()), f, s, b, base) } catch (e) { die((e as Error).message) } })
program.command('run <feature> <service> <name> [args...]').description('在服务运行体里跑 run.<name> 命令（透传 args）')
  .action((f, s, n, args) => sync((c) => runCommand(c, f, s, n, args ?? [])))
program.command('sh <feature> <service>').description('进入服务运行体的 shell')
  .action((f, s) => sync((c) => shCommand(c, f, s)))
program.command('down <feature>').description('拆除整个功能的所有服务 worktree（= rm <feature>）').option('-f, --force', '跳过脏/未推检查强制删除')
  .action(async (f, o) => { try { await rmCommand(loadConfig(process.cwd()), f, undefined, !!o.force) } catch (e) { die((e as Error).message) } })
program.command('rm <feature> [service]').description('拆除某服务或整槽的 worktree（默认查脏/未推保护）').option('-f, --force', '跳过脏/未推检查强制删除')
  .action(async (f, s, o) => { try { await rmCommand(loadConfig(process.cwd()), f, s, !!o.force) } catch (e) { die((e as Error).message) } })
program.command('gc').description('合并感知回收（默认 dry-run）').option('--apply', '实际执行回收')
  .action(async (o) => { try { await gcCommand(loadConfig(process.cwd()), !!o.apply) } catch (e) { die((e as Error).message) } })
program.command('completion <target> [shell]').description('install 一键装进 shell；或 bash|zsh|fish 打印补全脚本')
  .action((target, shell) => { try { if (target === 'install') installCompletion(shell); else completionCommand(target) } catch (e) { die((e as Error).message) } })
program.command('mcp').description('启动 MCP 服务（stdio，轻量脚本，客户端按需 spawn），供 AI 调用 worktree-bay')
  .action(() => { try { startMcp() } catch (e) { die((e as Error).message) } })
program.command('skill').description('打印 worktree-bay 使用与配置完全指南')
  .action(() => { try { log(readSkill()) } catch (e) { die((e as Error).message) } })
program.command('version').description('显示版本号').action(() => log(pkg.version))
program.command('__complete', { hidden: true }).allowUnknownOption().action(() => {
  const words = process.argv.slice(process.argv.indexOf('--') + 1)
  let cfg: BayConfig | null = null
  try { cfg = loadConfig(process.cwd()) } catch { /* 无配置：仍补全子命令，只是补不了 feature/service */ }
  try { console.log(complete(cfg, words).join('\n')) } catch { /* 静默 */ }
})
program.parseAsync(process.argv)
