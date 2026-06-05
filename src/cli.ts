#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig, BayConfig } from './config.js'
import { claimCommand } from './commands/claim.js'
import { lsCommand } from './commands/ls.js'
import { addCommand } from './commands/add.js'
import { die } from './util/log.js'

const program = new Command()
program.name('bay').description('worktree 槽位+端口编排器').version('0.1.0')
const sync = (fn: (c: BayConfig) => void) => { try { fn(loadConfig(process.cwd())) } catch (e) { die((e as Error).message) } }

program.command('claim <feature>').action(async (f) => { try { await claimCommand(loadConfig(process.cwd()), f) } catch (e) { die((e as Error).message) } })
program.command('ls').action(() => sync(lsCommand))
program.command('add <feature> <service> <branch> [base]').action(async (f, s, b, base) => { try { await addCommand(loadConfig(process.cwd()), f, s, b, base) } catch (e) { die((e as Error).message) } })
program.parseAsync(process.argv)
