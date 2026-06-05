export const log = (...a: unknown[]) => console.log(...a)
export const warn = (...a: unknown[]) => console.warn(...a)
export const die = (m: string): never => { console.error('worktree-bay: ' + m); process.exit(1) }
