import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
function git(repo: string, ...a: string[]) { return spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' }) }
function ok(repo: string, ...a: string[]): string { const r = git(repo, ...a); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr || r.stdout}`); return r.stdout }

export function branchExists(repo: string, branch: string): boolean {
  return git(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).status === 0
}
export function addWorktree(repo: string, dir: string, branch: string, base: string) {
  // 分支已存在（如上次 worktree 删了但分支留着）→ 直接挂出复用，不用 -b 重建（否则 git 会报 "branch already exists"）
  if (branchExists(repo, branch)) ok(repo, 'worktree', 'add', dir, branch)
  else ok(repo, 'worktree', 'add', '-b', branch, dir, base)
}
export async function removeWorktree(repo: string, dir: string, force: boolean): Promise<void> {
  const a = ['worktree', 'remove', dir]; if (force) a.push('--force')
  git(repo, ...a)   // 尽力移除；残留交给下面兜底（调用方已先过脏/未推保护，到这里删除是安全的）
  // git worktree remove 不会删被忽略的文件（前端 node_modules 等）→ 目录残留报 "Directory not empty"；
  // 它还可能先摘了登记再删目录失败，留下「git 不认但磁盘还在」的孤儿。统一兜底：物理删目录 + prune 同步元数据。
  // 用异步 rm，让删 node_modules（可能数秒）时上层 spinner 能转。
  if (fs.existsSync(dir)) await fs.promises.rm(dir, { recursive: true, force: true })
  git(repo, 'worktree', 'prune')
}
export function isDirty(dir: string): boolean { return ok(dir, 'status', '--porcelain').trim().length > 0 }
export function currentBranch(dir: string): string { return ok(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim() }
export function mainBranch(repo: string): string {
  const r = git(repo, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD')
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().replace(/^origin\//, '')
  for (const b of ['master', 'main']) if (git(repo, 'rev-parse', '--verify', `origin/${b}`).status === 0) return b
  return 'master'
}
export function isMergedToMain(repo: string, branch: string): boolean { git(repo, 'fetch', '-q', 'origin'); return git(repo, 'merge-base', '--is-ancestor', branch, `origin/${mainBranch(repo)}`).status === 0 }
export function remoteBranchGone(repo: string, branch: string): boolean { return git(repo, 'rev-parse', '--verify', `origin/${branch}`).status !== 0 }
export function hasUnpushed(repo: string, branch: string): boolean {
  const main = mainBranch(repo); const r = git(repo, 'log', '--oneline', `origin/${main}..${branch}`)
  if (r.status !== 0) return true
  if (!r.stdout.trim()) return false
  return remoteBranchGone(repo, branch) ? true : git(repo, 'log', '--oneline', `origin/${branch}..${branch}`).stdout.trim().length > 0
}
