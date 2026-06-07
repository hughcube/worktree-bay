import { describe, it, expect, vi } from 'vitest'
import { withProgress } from '../src/util/progress.js'

// 测试环境非 TTY → 走「开始…/✓ 完成」两行分支，不动画。这里验证它对结果与异常透明。
describe('withProgress (non-TTY)', () => {
  it('返回 fn 的结果且只执行一次', async () => {
    const fn = vi.fn(async () => 42)
    await expect(withProgress('copy', fn)).resolves.toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('fn 抛错时向上传播（spinner 已清理）', async () => {
    await expect(withProgress('copy', async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })
})
