import { BayConfig } from '../config.js'
import { readLabels } from '../slots.js'
import { log } from '../util/log.js'

const SUBCMDS = ['claim', 'add', 'ls', 'gc', 'rm', 'run', 'sh', 'completion']
export function complete(cfg: BayConfig, words: string[]): string[] {
  const args = words.slice(1)
  if (args.length === 0) return SUBCMDS
  const sub = args[0]; const pos = args.length
  if (['add', 'rm', 'run', 'sh'].includes(sub) && pos === 1) return Object.values(readLabels(cfg))
  if (['add', 'run', 'sh'].includes(sub) && pos === 2) return Object.keys(cfg.services)
  return []
}
export function completionScript(shell: string): string {
  if (shell === 'bash') return `_worktree_bay(){ COMPREPLY=( $(worktree-bay __complete -- "\${COMP_WORDS[@]}") ); }\ncomplete -F _worktree_bay worktree-bay`
  if (shell === 'zsh') return `#compdef worktree-bay\n_worktree_bay(){ compadd -- $(worktree-bay __complete -- "\${words[@]}") }\ncompdef _worktree_bay worktree-bay`
  if (shell === 'fish') return `complete -c worktree-bay -a '(worktree-bay __complete -- (commandline -opc))'`
  throw new Error('unsupported shell: ' + shell)
}
export function completionCommand(shell: string) { log(completionScript(shell)) }
