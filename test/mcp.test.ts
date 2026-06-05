import { describe, it, expect } from 'vitest'
import { INSTRUCTIONS, createServer } from '../src/mcp.js'

describe('mcp', () => {
  it('INSTRUCTIONS 覆盖核心工作流工具', () => {
    for (const t of ['worktree_bay_up', 'worktree_bay_ls', 'worktree_bay_run', 'worktree_bay_down', 'worktree_bay_gc']) {
      expect(INSTRUCTIONS).toContain(t)
    }
    expect(INSTRUCTIONS.length).toBeGreaterThan(100)
  })
  it('createServer 注册工具不抛错', () => {
    expect(() => createServer()).not.toThrow()
  })
})
