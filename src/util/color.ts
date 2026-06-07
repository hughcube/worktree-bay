// 轻量 ANSI 着色：仅在 TTY 且未设 NO_COLOR 时上色，否则原样返回（管道/CI/重定向不带控制符）。
const enabled = (!!process.stdout.isTTY || !!process.stderr.isTTY) && !process.env.NO_COLOR && process.env.TERM !== 'dumb'
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
