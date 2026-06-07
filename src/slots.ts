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

// 槽位元数据账本（.worktree-bay-slots.json）的记录。当前格式是【数组】，每个元素含 slot 号 +
// 功能名 + 分支 + 介绍（起槽时写、重入参考）+ 首次认领时间。历史格式（对象 { "<slot>": "功能名" } 或
// { "<slot>": { feature, ... } }）readSlots 读取时统一规范化，向后兼容；写盘一律是数组。
export interface SlotMeta { slot: number; feature: string; branch?: string; description?: string; createdAt?: string }
export function readSlots(cfg: BayConfig): Record<string, SlotMeta> {
  const p = labelPath(cfg); if (!fs.existsSync(p)) return {}
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
  const out: Record<string, SlotMeta> = {}
  if (Array.isArray(raw)) {                                    // 新格式：[{ slot, feature, ... }]
    for (const r of raw as SlotMeta[]) if (r && typeof r.slot === 'number') out[String(r.slot)] = { ...r }
  } else {                                                     // 旧格式：{ "<slot>": "feature" | { feature, ... } }
    for (const [k, v] of Object.entries(raw as Record<string, string | Omit<SlotMeta, 'slot'>>)) {
      const slot = Number(k); out[k] = typeof v === 'string' ? { slot, feature: v } : { slot, ...v }
    }
  }
  return out
}
// 写盘：内存 Record → 按槽号排序的数组，字段顺序固定（slot/feature/branch/description/createdAt）。
function save(cfg: BayConfig, store: Record<string, SlotMeta>) {
  const arr = Object.values(store).sort((a, b) => a.slot - b.slot).map((m) => ({
    slot: m.slot, feature: m.feature,
    ...(m.branch ? { branch: m.branch } : {}), ...(m.description ? { description: m.description } : {}), ...(m.createdAt ? { createdAt: m.createdAt } : {}),
  }))
  fs.writeFileSync(labelPath(cfg), JSON.stringify(arr, null, 2) + '\n')
}
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
  const n = freeSlot(cfg); const m: SlotMeta = { slot: n, feature: f }
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
