import fs from 'node:fs'
import path from 'node:path'

export async function withLock<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(ws, '.worktree-bay', 'lock')
  fs.mkdirSync(path.join(ws, '.worktree-bay'), { recursive: true })
  const start = Date.now()
  for (;;) {
    try { fs.mkdirSync(lockDir); break }
    catch { if (Date.now() - start > 30000) throw new Error('worktree-bay: lock timeout (另一个 worktree-bay 在运行?)'); await new Promise((r) => setTimeout(r, 50)) }
  }
  try { return await fn() } finally { fs.rmdirSync(lockDir) }
}
