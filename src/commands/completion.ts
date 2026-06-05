import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BayConfig } from '../config.js'
import { readLabels } from '../slots.js'
import { log } from '../util/log.js'

const SUBCMDS = ['claim', 'up', 'add', 'ls', 'gc', 'down', 'rm', 'run', 'sh', 'completion']
// words = 命令名 + 光标前已输入完的词（不含当前正在补的词）
export function complete(cfg: BayConfig, words: string[]): string[] {
  const prev = words.slice(1)
  if (prev.length === 0) return SUBCMDS
  const sub = prev[0]; const pos = prev.length
  const featureSubs = ['up', 'add', 'rm', 'down', 'run', 'sh']
  if (featureSubs.includes(sub) && pos === 1) return Object.values(readLabels(cfg))
  if (['add', 'run', 'sh'].includes(sub) && pos === 2) return Object.keys(cfg.services)
  if (sub === 'up' && pos >= 2) return Object.keys(cfg.services)   // up 接变长服务列表
  return []
}
export function completionScript(shell: string): string {
  // 脚本只传"光标前已完成的词"，不含当前正在补的词，与 complete() 的模型一致
  if (shell === 'bash') return `_worktree_bay(){ COMPREPLY=( $(worktree-bay __complete -- "\${COMP_WORDS[@]:0:\$COMP_CWORD}") ); }\ncomplete -F _worktree_bay worktree-bay`
  if (shell === 'zsh') return `#compdef worktree-bay\n_worktree_bay(){ compadd -- $(worktree-bay __complete -- "\${(@)words[1,CURRENT-1]}") }\ncompdef _worktree_bay worktree-bay`
  if (shell === 'fish') return `complete -c worktree-bay -f -a '(worktree-bay __complete -- (commandline -opc))'`
  throw new Error('unsupported shell: ' + shell)
}
export function completionCommand(shell: string) { log(completionScript(shell)) }

// 一键把补全装进当前 shell（幂等）。fish 直接写补全目录（零配置生效）；bash/zsh 往 rc 加一行 eval。
export function installCompletion(shell?: string): void {
  const sh = shell || path.basename(process.env.SHELL || 'bash')
  if (sh === 'fish') {
    const dir = path.join(os.homedir(), '.config', 'fish', 'completions')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'worktree-bay.fish')
    fs.writeFileSync(file, completionScript('fish') + '\n')
    log(`✓ fish 补全已写入 ${file}（新开 fish 即生效）`)
    return
  }
  const isZsh = sh === 'zsh'
  const rc = path.join(os.homedir(), isZsh ? '.zshrc' : '.bashrc')
  const line = `eval "$(worktree-bay completion ${isZsh ? 'zsh' : 'bash'})"`
  const cur = fs.existsSync(rc) ? fs.readFileSync(rc, 'utf8') : ''
  if (cur.includes(line)) { log(`✓ 补全已在 ${rc}，无需重复安装`); return }
  fs.appendFileSync(rc, `\n# worktree-bay completion\n${line}\n`)
  log(`✓ 补全已加入 ${rc}，执行 'source ${rc}' 或重开终端即生效`)
}
