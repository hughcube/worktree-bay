// 轻量 i18n：按系统语言自动中/英。文案与代码同处（t(zh, en)），便于审阅；无外部依赖。
export type Lang = 'zh' | 'en'

// 识别顺序：WORKTREE_BAY_LANG 覆盖 → POSIX locale 环境变量 → Intl(OS 区域) → 回落中文。
// 规则：命中 zh* → zh；有明确的非中文 locale → en；完全识别不出 → zh（用户选定的回落）。
export function detectLang(): Lang {
  const envLocale = process.env.WORKTREE_BAY_LANG || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  if (/^zh/i.test(envLocale)) return 'zh'
  if (envLocale.trim()) return 'en'
  let osLocale = ''
  try { osLocale = Intl.DateTimeFormat().resolvedOptions().locale } catch { /* 某些精简运行时无 Intl */ }
  if (/^zh/i.test(osLocale)) return 'zh'
  if (osLocale.trim()) return 'en'
  return 'zh'
}

// 取中/英文案。两种语言都就地给出，运行时按 detectLang() 选。
export function t(zh: string, en: string): string {
  return detectLang() === 'zh' ? zh : en
}
