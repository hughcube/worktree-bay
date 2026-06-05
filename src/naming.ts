export function slugify(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40).replace(/-+$/g, '')
}
export function worktreeDirName(slot: number, slug: string): string { return `s${slot}-${slug}` }
export function parseWorktreeDir(name: string): { slot: number; slug: string } | null {
  const m = /^s(\d+)-(.+)$/.exec(name)
  return m ? { slot: Number(m[1]), slug: m[2] } : null
}
