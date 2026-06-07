import { describe, it, expect } from 'vitest'
import { friendlyParseError } from '../src/util/clierr.js'

// setup.ts 固定 WORKTREE_BAY_LANG=zh，这里断言中文文案。入参是 commander 写到 writeErr 的英文文本。
describe('clierr friendlyParseError', () => {
  const up = { name: 'up', usage: '<feature> <services...>', description: '起多个服务' }
  it('缺少参数 → 中文 + 用法 + 建议', () => {
    const m = friendlyParseError("error: missing required argument 'services'\n", up)
    expect(m).toContain('缺少必填参数「services」')
    expect(m).toContain('worktree-bay up <feature> <services...>')
    expect(m).toContain('worktree-bay help up')
  })
  it('未知命令', () => expect(friendlyParseError("error: unknown command 'foo'")).toContain('未知命令「foo」'))
  it('未知选项', () => expect(friendlyParseError("error: unknown option '--xyz'", up)).toContain('未知选项「--xyz」'))
  it('参数过多', () => expect(friendlyParseError('error: too many arguments', up)).toContain('参数过多'))
  it('其它错误：去掉 error: 前缀透传', () => expect(friendlyParseError('error: boom')).toBe('boom'))
})
