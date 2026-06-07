import { describe, it, expect, afterEach } from 'vitest'
import { detectLang, t } from '../src/i18n.js'

const KEYS = ['WORKTREE_BAY_LANG', 'LC_ALL', 'LC_MESSAGES', 'LANG'] as const
function clear() { for (const k of KEYS) delete process.env[k] }
afterEach(() => { clear(); process.env.WORKTREE_BAY_LANG = 'zh' })   // 恢复 setup.ts 的默认，避免污染其它测试

describe('i18n detectLang', () => {
  it('WORKTREE_BAY_LANG 覆盖最高优先', () => {
    clear(); process.env.WORKTREE_BAY_LANG = 'en'; expect(detectLang()).toBe('en')
    process.env.WORKTREE_BAY_LANG = 'zh'; expect(detectLang()).toBe('zh')
  })
  it('按 LANG/LC 识别：zh* → zh，明确非中文 → en', () => {
    clear(); process.env.LANG = 'zh_CN.UTF-8'; expect(detectLang()).toBe('zh')
    clear(); process.env.LANG = 'en_US.UTF-8'; expect(detectLang()).toBe('en')
    clear(); process.env.LC_ALL = 'fr_FR.UTF-8'; expect(detectLang()).toBe('en')
  })
  it('t() 按当前语言返回对应文案', () => {
    clear(); process.env.WORKTREE_BAY_LANG = 'zh'; expect(t('中文', 'english')).toBe('中文')
    process.env.WORKTREE_BAY_LANG = 'en'; expect(t('中文', 'english')).toBe('english')
  })
  it('完全识别不出时仍返回合法语言（回落中文逻辑）', () => {
    clear(); expect(['zh', 'en']).toContain(detectLang())
  })
})
