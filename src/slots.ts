import fs from 'node:fs'
import path from 'node:path'
import { BayConfig, repoPath } from './config.js'
import { parseWorktreeDir } from './naming.js'

export interface Occupant { service: string; slot: number; slug: string; dir: string }
export function scanOccupancy(cfg: BayConfig): Map<number, Occupant[]> {
  const map = new Map<number, Occupant[]>()
  for (const service of Object.keys(cfg.services)) {
    const root = path.join(repoPath(cfg, service), '.worktrees'); if (!fs.existsSync(root)) continue
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const p = parseWorktreeDir(e.name); if (!p) continue
      const list = map.get(p.slot) ?? []; list.push({ service, slot: p.slot, slug: e.name, dir: path.join(root, e.name) }); map.set(p.slot, list)
    }
  }
  return map
}
function labelPath(cfg: BayConfig) { return path.join(cfg.workspaceRoot, '.worktree-bay-slots.json') }
export function readLabels(cfg: BayConfig): Record<string, string> { const p = labelPath(cfg); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {} }
function save(cfg: BayConfig, l: Record<string, string>) { fs.writeFileSync(labelPath(cfg), JSON.stringify(l, null, 2) + '\n') }
export function writeLabel(cfg: BayConfig, slot: number, f: string) { const l = readLabels(cfg); l[String(slot)] = f; save(cfg, l) }
export function removeLabel(cfg: BayConfig, slot: number) { const l = readLabels(cfg); delete l[String(slot)]; save(cfg, l) }
export function slotOfFeature(cfg: BayConfig, f: string): number | undefined { for (const [k, v] of Object.entries(readLabels(cfg))) if (v === f) return Number(k); return undefined }
export function freeSlot(cfg: BayConfig): number {
  const occ = scanOccupancy(cfg); const l = readLabels(cfg)
  for (let n = 1; n <= cfg.maxSlots; n++) if (!occ.has(n) && l[String(n)] === undefined) return n
  throw new Error(`no free slot (1..${cfg.maxSlots} all taken)`)
}
export function claim(cfg: BayConfig, f: string): number { const e = slotOfFeature(cfg, f); if (e !== undefined) return e; const n = freeSlot(cfg); writeLabel(cfg, n, f); return n }
export function pruneEmptyLabels(cfg: BayConfig): { slot: number; feature: string }[] {
  const occ = scanOccupancy(cfg); const removed: { slot: number; feature: string }[] = []
  for (const [k, v] of Object.entries(readLabels(cfg))) if (!occ.has(Number(k))) removed.push({ slot: Number(k), feature: v })
  return removed
}
