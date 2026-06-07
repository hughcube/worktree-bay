// 终端是否「类 TTY」（可上色/动画）。Git Bash/mintty 下 Node 的 isTTY 会误报 false，
// 但其实是交互终端、支持 ANSI（MSYSTEM/TERM_PROGRAM 可识别）。MCP/脚本可设 WORKTREE_BAY_NONINTERACTIVE 强制纯文本。
export function ttyLike(stream?: { isTTY?: boolean }): boolean {
  if (process.env.WORKTREE_BAY_NONINTERACTIVE) return false
  if (stream?.isTTY) return true
  return !!(process.env.MSYSTEM || process.env.TERM_PROGRAM === 'mintty')
}

// 轻量 ANSI 着色：仅在类 TTY 且未设 NO_COLOR 时上色，否则原样返回（管道/CI/重定向/MCP 不带控制符）。
const enabled = (ttyLike(process.stdout) || ttyLike(process.stderr)) && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
const paint = (code: string) => (s: string): string => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s)

export const color = {
  enabled,
  green: paint('32'),
  red: paint('31'),
  yellow: paint('33'),
  cyan: paint('36'),
  blue: paint('34'),
  dim: paint('2'),
  bold: paint('1'),
}
