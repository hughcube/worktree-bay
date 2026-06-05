#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig, BayConfig } from './config.js'
import { claimCommand } from './commands/claim.js'
import { lsCommand } from './commands/ls.js'
import { addCommand } from './commands/add.js'
import { runCommand, shCommand } from './commands/passthrough.js'
import { rmCommand } from './commands/rm.js'
import { gcCommand } from './commands/gc.js'
import { complete, completionCommand } from './commands/completion.js'
import { die } from './util/log.js'

const program = new Command()
program.name('bay').description('worktree 槽位+端口编排器').version('0.1.0')
const sync = (fn: (c: BayConfig) => void) => { try { fn(loadConfig(process.cwd())) } catch (e) { die((e as Error).message) } }

program.command('claim <feature>').action(async (f) => { try { await claimCommand(loadConfig(process.cwd()), f) } catch (e) { die((e as Error).message) } })
program.command('ls').action(() => sync(lsCommand))
program.command('add <feature> <service> <branch> [base]').action(async (f, s, b, base) => { try { await addCommand(loadConfig(process.cwd()), f, s, b, base) } catch (e) { die((e as Error).message) } })
program.command('run <feature> <service> <name> [args...]').action((f, s, n, args) => sync((c) => runCommand(c, f, s, n, args ?? [])))
program.command('sh <feature> <service>').action((f, s) => sync((c) => shCommand(c, f, s)))
program.command('rm <feature> [service]').option('-f, --force').action(async (f, s, o) => { try { await rmCommand(loadConfig(process.cwd()), f, s, !!o.force) } catch (e) { die((e as Error).message) } })
program.command('gc').option('--apply').action(async (o) => { try { await gcCommand(loadConfig(process.cwd()), !!o.apply) } catch (e) { die((e as Error).message) } })
program.command('completion <shell>').action((sh) => { try { completionCommand(sh) } catch (e) { die((e as Error).message) } })
program.command('__complete', { hidden: true }).allowUnknownOption().action(() => {
  const words = process.argv.slice(process.argv.indexOf('--') + 1)
  try { console.log(complete(loadConfig(process.cwd()), words).join('\n')) } catch { /* 静默 */ }
})
program.parseAsync(process.argv)
