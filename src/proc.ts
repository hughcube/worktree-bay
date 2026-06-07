import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

// 托管后台 dev server（start 命令）：detach 启动、日志落盘、登记 PID；按 worktree 目录作为唯一键。
// 登记账本 <ws>/.worktree-bay/processes.json，读写都在工作区锁内（up/down 持锁）。
export interface ProcRec { dir: string; service: string; port: number; pid: number; cmd: string; log: string; startedAt: number }

function regPath(ws: string): string { return path.join(ws, '.worktree-bay', 'processes.json') }
export function readProcs(ws: string): ProcRec[] { const p = regPath(ws); try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [] } catch { return [] } }
function writeProcs(ws: string, recs: ProcRec[]): void { fs.mkdirSync(path.join(ws, '.worktree-bay'), { recursive: true }); fs.writeFileSync(regPath(ws), JSON.stringify(recs, null, 2) + '\n') }

export function pidAlive(pid: number): boolean { if (!pid || pid < 1) return false; try { process.kill(pid, 0); return true } catch { return false } }
export function recordedFor(ws: string, dir: string): ProcRec | undefined { return readProcs(ws).find((r) => r.dir === dir) }
export function setPid(ws: string, dir: string, pid: number): void { const recs = readProcs(ws); const r = recs.find((x) => x.dir === dir); if (r) { r.pid = pid; writeProcs(ws, recs) } }
export function readLogTail(file: string, lines = 15): string {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-lines).join('\n') } catch { return '' }
}

// 找出监听某端口的进程 pid（shell/pnpm 等中间层会让记录的 pid 漂移，按端口查最可靠）。
export function pidOnPort(port: number): number | undefined {
  if (process.platform === 'win32') {
    const r = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
    for (const line of (r.stdout || '').split(/\r?\n/)) {
      const m = new RegExp(`[:.]${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i').exec(line)
      if (m) return Number(m[1])
    }
    return undefined
  }
  let r = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (r.status === 0 && r.stdout.trim()) { const pid = parseInt(r.stdout.trim().split(/\s+/)[0], 10); if (pid) return pid }
  r = spawnSync('ss', ['-ltnp'], { encoding: 'utf8' })
  if (r.status === 0) { const m = new RegExp(`:${port}\\s.*pid=(\\d+)`).exec(r.stdout || ''); if (m) return Number(m[1]) }
  return undefined
}

export function startDetached(ws: string, dir: string, service: string, slug: string, port: number, cmd: string): ProcRec {
  const logDir = path.join(ws, '.worktree-bay', 'logs'); fs.mkdirSync(logDir, { recursive: true })
  const log = path.join(logDir, `${slug}-${service}.log`)
  const fd = fs.openSync(log, 'a')
  // 后台启动、CLI 退出后仍存活、且不弹窗：
  // - Windows：不要 detached（detached 会新开控制台窗口、且与 windowsHide 冲突）；用 windowsHide 抑制窗口，
  //   子进程在父进程正常退出后不会被自动杀（Windows 默认不 kill-on-parent-exit），kill 时用 taskkill /T 杀进程树。
  // - 类 Unix：detached 建新进程组，便于用 kill(-pid) 整组结束。
  // 两边都把 stdout/stderr 落日志文件，并 unref 让本进程能直接退出。
  const detached = process.platform !== 'win32'
  const child = spawn(cmd, { cwd: dir, shell: true, detached, stdio: ['ignore', fd, fd], windowsHide: true })
  const pid = child.pid ?? -1
  child.unref()
  const rec: ProcRec = { dir, service, port, pid, cmd, log, startedAt: Date.now() }
  writeProcs(ws, [...readProcs(ws).filter((r) => r.dir !== dir), rec])
  return rec
}

function killTree(pid: number): void {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'])
  else { try { process.kill(-pid, 'SIGTERM') } catch { try { process.kill(pid, 'SIGTERM') } catch { /* 已退出 */ } } }
}

// 停掉某 worktree 的托管进程（含进程树），并从账本移除。返回被停的记录（无则 undefined）。
// 同时按「记录 pid」和「当前端口占用 pid」双杀——shell/pnpm 中间层会让记录 pid 漂移，按端口兜底最稳。
export function stopManaged(ws: string, dir: string): ProcRec | undefined {
  const recs = readProcs(ws); const rec = recs.find((r) => r.dir === dir)
  if (!rec) return undefined
  const targets = new Set<number>()
  if (rec.pid > 0) targets.add(rec.pid)
  const onPort = pidOnPort(rec.port); if (onPort) targets.add(onPort)
  for (const pid of targets) if (pidAlive(pid)) killTree(pid)
  writeProcs(ws, recs.filter((r) => r.dir !== dir))
  return rec
}
