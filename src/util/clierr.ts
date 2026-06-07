import { t } from '../i18n.js'

// 把 commander 的英文解析错误文本（"error: missing required argument 'services'" 等）
// 翻成自然语言（中/英）+ 用法 + 可执行建议。从消息文本判别类型（exitOverride 在子命令上不可靠，
// 但 configureOutput.writeErr 会被继承，所以走文本判别最稳）。
export interface CmdUsage { name: string; usage: string; description: string }

export function friendlyParseError(rawMessage: string, cmd?: CmdUsage): string {
  const m = (rawMessage || '').replace(/\r?\n$/, '')
  const grab = (re: RegExp): string => { const x = re.exec(m); return x ? x[1] : '' }
  const hint = cmd
    ? t(`\n用法: worktree-bay ${cmd.name} ${cmd.usage}\n说明: ${cmd.description}\n查看完整帮助: worktree-bay help ${cmd.name}`,
        `\nUsage: worktree-bay ${cmd.name} ${cmd.usage}\n${cmd.description}\nFull help: worktree-bay help ${cmd.name}`)
    : t('\n运行 worktree-bay help 查看所有命令与用法', '\nRun: worktree-bay help')
  if (/missing required argument/i.test(m))
    return t(`缺少必填参数「${grab(/argument '(.+?)'/)}」。把它补在命令后面再试。${hint}`,
             `Missing required argument "${grab(/argument '(.+?)'/)}". Append it to the command and retry.${hint}`)
  if (/argument missing/i.test(m))
    return t(`选项「${grab(/option '(.+?)'/)}」缺少取值。${hint}`, `Option "${grab(/option '(.+?)'/)}" needs a value.${hint}`)
  if (/too many arguments/i.test(m))
    return t(`参数过多，多余的请删掉。${hint}`, `Too many arguments — remove the extra ones.${hint}`)
  if (/unknown option/i.test(m))
    return t(`未知选项「${grab(/unknown option '?(.+?)'?$/)}」。检查拼写或去掉它。${hint}`,
             `Unknown option "${grab(/unknown option '?(.+?)'?$/)}" — check spelling or drop it.${hint}`)
  if (/unknown command/i.test(m))
    return t(`未知命令「${grab(/unknown command '(.+?)'/)}」。运行 worktree-bay help 查看所有命令。`,
             `Unknown command "${grab(/unknown command '(.+?)'/)}". Run: worktree-bay help`)
  return m.replace(/^error:\s*/i, '')
}
