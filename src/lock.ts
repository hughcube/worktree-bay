import fs from 'node:fs'
import path from 'node:path'
import { t } from './i18n.js'
import { warn } from './util/log.js'

// 工作区原子锁（mkdir）。锁目录内写 owner=pid：
// - 锁主进程已死 / 无主（陈旧锁，多为上次进程被杀残留）→ 秒级清除重试，不再空等 30s；
// - 锁被另一个在跑的 worktree-bay 持有 → 立刻提示在等谁，再按需等待，超时给明确指引。
function pidAlive(pid: number): boolean { if (!pid) return false; try { process.kill(pid, 0); return true } catch { return false } }
function ownerPid(lockDir: string): number | null {
  try { const n = Number(fs.readFileSync(path.join(lockDir, 'owner'), 'utf8').trim()); return n || null } catch { return null }
}

export async function withLock<T>(ws: string, fn: () => Promise<T>): Promise<T> {
  const baseDir = path.join(ws, '.worktree-bay')
  const lockDir = path.join(baseDir, 'lock')
  fs.mkdirSync(baseDir, { recursive: true })
  const start = Date.now()
  let notified = false
  let ownerMissingSince = 0
  for (;;) {
    try { fs.mkdirSync(lockDir); break }   // 抢到锁
    catch {
      const pid = ownerPid(lockDir)
      if (pid === null) {
        // 无 owner 文件：可能是陈旧锁（旧版/被杀残留），也可能是别人刚抢到还没写 owner（竞态）。
        // 给 ~600ms 宽限，仍无主就当陈旧锁清掉。
        if (ownerMissingSince === 0) ownerMissingSince = Date.now()
        if (Date.now() - ownerMissingSince > 600) { try { fs.rmSync(lockDir, { recursive: true, force: true }) } catch { /* 让下轮重试 */ } ownerMissingSince = 0; continue }
      } else {
        ownerMissingSince = 0
        if (!pidAlive(pid)) { try { fs.rmSync(lockDir, { recursive: true, force: true }) } catch { /* 重试 */ } continue }   // 锁主已死 → 陈旧锁，清掉
        if (!notified) { warn(t(`正在等待另一个 worktree-bay（pid ${pid}）释放工作区锁…`, `waiting for another worktree-bay (pid ${pid}) to release the workspace lock…`)); notified = true }
        if (Date.now() - start > 30000) throw new Error(t(`等待工作区锁超时：另一个 worktree-bay（pid ${pid}）仍持有。若它已卡死，结束该进程或删掉 ${lockDir} 再试。`, `timed out waiting for the workspace lock: another worktree-bay (pid ${pid}) still holds it. If stuck, kill it or delete ${lockDir}, then retry.`))
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  try { fs.writeFileSync(path.join(lockDir, 'owner'), String(process.pid)) } catch { /* 忽略：owner 仅用于陈旧检测 */ }
  try { return await fn() } finally { try { fs.rmSync(lockDir, { recursive: true, force: true }) } catch { /* 已被清理 */ } }
}
