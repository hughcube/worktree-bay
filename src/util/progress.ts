import { log } from './log.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// 给长耗时异步步骤一个「在干活」的反馈：TTY 下转圈 + 秒数（写 stderr，用 \r 原地刷新），
// 非 TTY（管道 / CI / MCP）下退化为「开始…」「✓ 完成（Ns）」两行，避免刷屏。
export async function withProgress<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  const secs = (): string => ((Date.now() - t0) / 1000).toFixed(1)
  if (!process.stderr.isTTY) {
    log(`  → ${label} …`)
    const r = await fn()
    log(`  ✓ ${label}（${secs()}s）`)
    return r
  }
  let i = 0
  const timer = setInterval(() => { process.stderr.write(`\r  ${FRAMES[i++ % FRAMES.length]} ${label} ${secs()}s `) }, 120)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    return await fn()
  } finally {
    clearInterval(timer)
    process.stderr.write(`\r  ✓ ${label}（${secs()}s）          \n`)
  }
}
