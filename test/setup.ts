// Neutralize the user's global git config (core.hooksPath -> conventional-commit
// hook) so tests that spin up throwaway repos can commit freely.
process.env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'
process.env.GIT_CONFIG_SYSTEM = process.platform === 'win32' ? 'NUL' : '/dev/null'

// Pin the CLI output language so assertions on Chinese strings are deterministic
// regardless of the host/CI locale. (i18n.test.ts overrides this per-case.)
process.env.WORKTREE_BAY_LANG = 'zh'
