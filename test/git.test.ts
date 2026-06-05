import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { addWorktree, removeWorktree, isDirty, mainBranch, isMergedToMain, hasUnpushed } from '../src/git.js'

const g = (cwd: string, ...a: string[]) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' })
let origin: string, clone: string
beforeEach(() => {
  origin = fs.mkdtempSync(path.join(os.tmpdir(), 'bayo-')); spawnSync('git', ['init', '-q', '--bare', '--initial-branch=master', origin])
  clone = fs.mkdtempSync(path.join(os.tmpdir(), 'bayc-')); spawnSync('git', ['clone', '-q', origin, clone])
  g(clone, 'config', 'user.email', 't@t'); g(clone, 'config', 'user.name', 't')
  fs.writeFileSync(path.join(clone, 'f'), 'a'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'init'); g(clone, 'push', '-q', 'origin', 'master')
})
afterEach(() => { for (const d of [origin, clone]) fs.rmSync(d, { recursive: true, force: true }) })

describe('git', () => {
  it('addWorktree -b + isDirty + remove', () => {
    const dir = path.join(clone, '.worktrees', 's1-x'); addWorktree(clone, dir, 'feat', 'HEAD')
    expect(fs.existsSync(path.join(dir, 'f'))).toBe(true); expect(isDirty(dir)).toBe(false)
    fs.writeFileSync(path.join(dir, 'f'), 'b'); expect(isDirty(dir)).toBe(true); removeWorktree(clone, dir, true); expect(fs.existsSync(dir)).toBe(false)
  })
  it('mainBranch/merged/unpushed', () => {
    expect(mainBranch(clone)).toBe('master')
    g(clone, 'checkout', '-qb', 'merged'); fs.writeFileSync(path.join(clone, 'g'), 'b'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'm')
    g(clone, 'checkout', '-q', 'master'); g(clone, 'merge', '-q', 'merged'); g(clone, 'push', '-q', 'origin', 'master'); expect(isMergedToMain(clone, 'merged')).toBe(true)
    g(clone, 'checkout', '-qb', 'open'); fs.writeFileSync(path.join(clone, 'h'), 'c'); g(clone, 'add', '-A'); g(clone, 'commit', '-qm', 'o')
    expect(isMergedToMain(clone, 'open')).toBe(false); expect(hasUnpushed(clone, 'open')).toBe(true)
  })
})
