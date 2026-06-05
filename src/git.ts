import { spawnSync } from 'node:child_process'
function git(repo: string, ...a: string[]) { return spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' }) }
function ok(repo: string, ...a: string[]): string { const r = git(repo, ...a); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr || r.stdout}`); return r.stdout }

export function addWorktree(repo: string, dir: string, branch: string, base: string) { ok(repo, 'worktree', 'add', '-b', branch, dir, base) }
export function removeWorktree(repo: string, dir: string, force: boolean) { const a = ['worktree', 'remove', dir]; if (force) a.push('--force'); const r = git(repo, ...a); if (r.status !== 0) throw new Error('worktree remove: ' + (r.stderr || r.stdout)); git(repo, 'worktree', 'prune') }
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
