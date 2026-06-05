#!/usr/bin/env node
import { Command } from 'commander'
const program = new Command()
program.name('bay').description('worktree 槽位+端口编排器').version('0.1.0')
program.parseAsync(process.argv)
