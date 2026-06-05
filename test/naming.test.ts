import { describe, it, expect } from 'vitest'
import { slugify, worktreeDirName, parseWorktreeDir } from '../src/naming.js'

describe('naming', () => {
  it('slugify 归一化 + 截断', () => {
    expect(slugify('feature/Enroll-UI')).toBe('feature-enroll-ui')
    expect(slugify('a'.repeat(60)).length).toBeLessThanOrEqual(40)
  })
  it('worktreeDirName 烙槽号', () => { expect(worktreeDirName(2, 'feat-x')).toBe('s2-feat-x') })
  it('parseWorktreeDir', () => {
    expect(parseWorktreeDir('s2-feat-x')).toEqual({ slot: 2, slug: 'feat-x' })
    expect(parseWorktreeDir('nope')).toBeNull()
  })
})
