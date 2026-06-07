// Neutralize the user's global git config (core.hooksPath -> conventional-commit
// hook) so tests that spin up throwaway repos can commit freely.
process.env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
process.env.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null'

// Pin the CLI output language so assertions on Chinese strings are deterministic
// regardless of the host/CI locale. (i18n.test.ts overrides this per-case.)
process.env.WORKTREE_BAY_LANG = 'zh'

// 测试统一走非交互（无色/无 spinner/无折叠），让 runShellLive/withProgress 行为确定，
// 不受本机（如 Git Bash/mintty）影响。
process.env.WORKTREE_BAY_NONINTERACTIVE = '1'
