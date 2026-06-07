import fs from 'node:fs'
import path from 'node:path'
import { BayConfig, repoPath } from './config.js'
import { parseWorktreeDir } from './naming.js'
import { t } from './i18n.js'

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

// 槽位元数据账本（.worktree-bay-slots.json）每个槽的值。历史上是纯字符串（功能名），现升级为富对象，
// 多记分支名、介绍（起槽时写，重入时作参考）、首次认领时间。readSlots 读取时把旧的字符串值规范化为
// { feature }，向后兼容；写入一律是富对象。
export interface SlotMeta { feature: string; branch?: string; description?: string; createdAt?: string }
export function readSlots(cfg: BayConfig): Record<string, SlotMeta> {
  const p = labelPath(cfg); if (!fs.existsSync(p)) return {}
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, string | SlotMeta>
  const out: Record<string, SlotMeta> = {}
  for (const [k, v] of Object.entries(raw)) out[k] = typeof v === 'string' ? { feature: v } : v
  return out
}
function save(cfg: BayConfig, store: Record<string, SlotMeta>) { fs.writeFileSync(labelPath(cfg), JSON.stringify(store, null, 2) + '\n') }
// 兼容旧调用：slot → 功能名（completion/ls 等仍按字符串用）。
export function readLabels(cfg: BayConfig): Record<string, string> { const o: Record<string, string> = {}; for (const [k, v] of Object.entries(readSlots(cfg))) o[k] = v.feature; return o }
export function removeLabel(cfg: BayConfig, slot: number) { const s = readSlots(cfg); delete s[String(slot)]; save(cfg, s) }
export function slotOfFeature(cfg: BayConfig, f: string): number | undefined { for (const [k, v] of Object.entries(readSlots(cfg))) if (v.feature === f) return Number(k); return undefined }
export function freeSlot(cfg: BayConfig): number {
  const occ = scanOccupancy(cfg); const s = readSlots(cfg)
  for (let n = 1; n <= cfg.maxSlots; n++) if (!occ.has(n) && s[String(n)] === undefined) return n
  throw new Error(t(`没有空闲槽位（1..${cfg.maxSlots} 全部占用）。用 \`worktree-bay gc\` 回收已合并的，或 \`worktree-bay down <功能>\` 拆掉用完的，或调大配置里的 maxSlots。`, `no free slot (1..${cfg.maxSlots} all taken). Reclaim merged ones with \`worktree-bay gc\`, tear down finished ones with \`worktree-bay down <feature>\`, or raise maxSlots in your config.`))
}
// 占槽。首次认领写入 { feature, branch?, description?, createdAt }；已占同名功能则【补全/更新】非空的
// branch / description（保留首次的 createdAt）——所以同一功能重入 up/claim 带上新 --description 即可改介绍。
export function claim(cfg: BayConfig, f: string, meta: { branch?: string; description?: string } = {}): number {
  const store = readSlots(cfg); const existing = slotOfFeature(cfg, f)
  if (existing !== undefined) {
    const cur = store[String(existing)]; const next: SlotMeta = { ...cur }
    if (meta.branch) next.branch = meta.branch
    if (meta.description) next.description = meta.description
    if (JSON.stringify(next) !== JSON.stringify(cur)) { store[String(existing)] = next; save(cfg, store) }
    return existing
  }
  const n = freeSlot(cfg); const m: SlotMeta = { feature: f }
  if (meta.branch) m.branch = meta.branch
  if (meta.description) m.description = meta.description
  m.createdAt = new Date().toISOString()
  store[String(n)] = m; save(cfg, store); return n
}
export function pruneEmptyLabels(cfg: BayConfig): { slot: number; feature: string }[] {
  const occ = scanOccupancy(cfg); const removed: { slot: number; feature: string }[] = []
  for (const [k, v] of Object.entries(readSlots(cfg))) if (!occ.has(Number(k))) removed.push({ slot: Number(k), feature: v.feature })
  return removed
}
