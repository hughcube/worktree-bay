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
  if (shell === 'bash') return `_bay(){ COMPREPLY=( $(bay __complete -- "\${COMP_WORDS[@]}") ); }\ncomplete -F _bay bay`
  if (shell === 'zsh') return `#compdef bay\n_bay(){ compadd -- $(bay __complete -- "\${words[@]}") }\ncompdef _bay bay`
  if (shell === 'fish') return `complete -c bay -a '(bay __complete -- (commandline -opc))'`
  throw new Error('unsupported shell: ' + shell)
}
export function completionCommand(shell: string) { log(completionScript(shell)) }
