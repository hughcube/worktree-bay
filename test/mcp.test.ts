import { describe, it, expect } from 'vitest'
import { INSTRUCTIONS, TOOLS, handle } from '../src/mcp.js'

describe('mcp (lightweight stdio JSON-RPC)', () => {
  it('initialize 返回协议版本 + serverInfo + instructions', () => {
    const r = handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) as any
    expect(r.result.protocolVersion).toBeTruthy()
    expect(r.result.serverInfo.name).toBe('worktree-bay')
    expect(r.result.instructions).toContain('worktree_bay_up')
    expect(INSTRUCTIONS.length).toBeGreaterThan(100)
  })
  it('tools/list 返回 11 个工具', () => {
    const r = handle({ id: 2, method: 'tools/list' }) as any
    expect(r.result.tools.map((t: any) => t.name)).toEqual([
      'worktree_bay_doctor', 'worktree_bay_ls', 'worktree_bay_up', 'worktree_bay_claim', 'worktree_bay_add', 'worktree_bay_path', 'worktree_bay_run', 'worktree_bay_down', 'worktree_bay_gc', 'worktree_bay_init', 'worktree_bay_skill',
    ])
  })
  it('tools/call 未知工具返回错误', () => {
    const r = handle({ id: 3, method: 'tools/call', params: { name: 'nope' } }) as any
    expect(r.error.message).toContain('nope')
  })
  it('toArgs 拼出正确的 CLI 参数', () => {
    expect(TOOLS.find((t) => t.name === 'worktree_bay_up')!.toArgs({ feature: 'f', services: ['api', 'lms'] })).toEqual(['up', 'f', 'api', 'lms'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_gc')!.toArgs({ apply: true })).toEqual(['gc', '--apply'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_down')!.toArgs({ feature: 'f', force: true })).toEqual(['rm', 'f', '-f'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_down')!.toArgs({ feature: 'f' })).toEqual(['rm', 'f'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_down')!.toArgs({ feature: 'f', service: 'api' })).toEqual(['rm', 'f', 'api'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_ls')!.toArgs({})).toEqual(['ls', '--json'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_path')!.toArgs({ feature: 'f', service: 'api' })).toEqual(['path', 'f', 'api'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_doctor')!.toArgs({})).toEqual(['doctor'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_claim')!.toArgs({ feature: 'f' })).toEqual(['claim', 'f'])
    expect(TOOLS.find((t) => t.name === 'worktree_bay_init')!.toArgs({})).toEqual(['init'])
  })
  it('notifications 不回响应；未知方法回 method not found', () => {
    expect(handle({ method: 'notifications/initialized' })).toBeNull()
    const r = handle({ id: 9, method: 'bogus' }) as any
    expect(r.error.code).toBe(-32601)
  })
})
