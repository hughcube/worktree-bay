import fs from 'node:fs'
import path from 'node:path'
import { t } from './i18n.js'

export async function withLock<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(ws, '.worktree-bay', 'lock')
  fs.mkdirSync(path.join(ws, '.worktree-bay'), { recursive: true })
  const start = Date.now()
  for (;;) {
    try { fs.mkdirSync(lockDir); break }
    catch { if (Date.now() - start > 30000) throw new Error(t('获取工作区锁超时（是否有另一个 worktree-bay 在运行？）。若确认没有，删掉 .worktree-bay/lock 目录再试。', 'timed out acquiring the workspace lock (is another worktree-bay running?). If not, delete the .worktree-bay/lock directory and retry.')); await new Promise((r) => setTimeout(r, 50)) }
  }
  try { return await fn() } finally { fs.rmdirSync(lockDir) }
}
