import { describe, it, expect } from 'vitest'
import { readSkill } from '../src/skill.js'

describe('skill', () => {
  it('指南包含命令与配置详解', () => {
    const s = readSkill()
    expect(s.length).toBeGreaterThan(800)
    for (const k of ['worktree-bay.config.json', 'offset', 'upstream', '模板变量', 'worktree_bay_skill']) expect(s).toContain(k)
  })
})
