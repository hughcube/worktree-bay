import fs from 'node:fs'
import path from 'node:path'

export async function withLock<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(ws, '.bay', 'lock')
  fs.mkdirSync(path.join(ws, '.bay'), { recursive: true })
  const start = Date.now()
  for (;;) {
    try { fs.mkdirSync(lockDir); break }
    catch { if (Date.now() - start > 30000) throw new Error('bay: lock timeout (另一个 bay 在运行?)'); await new Promise((r) => setTimeout(r, 50)) }
  }
  try { return await fn() } finally { fs.rmdirSync(lockDir) }
}
