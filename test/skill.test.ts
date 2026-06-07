import { describe, it, expect } from 'vitest'
import { readSkill } from '../src/skill.js'

describe('skill', () => {
  it('指南包含命令与配置详解', () => {
    const s = readSkill()
    expect(s.length).toBeGreaterThan(800)
    for (const k of ['worktree-bay.config.json', '端口段', 'upstream', '模板变量', 'worktree_bay_skill']) expect(s).toContain(k)
    // 旧端口模型术语应已彻底移除（按服务分段后不再有 portBase/slotSpan/offset/blockBase）
    for (const stale of ['portBase', 'slotSpan', 'offset', 'blockBase']) expect(s).not.toContain(stale)
  })
})
