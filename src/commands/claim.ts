import { BayConfig } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { blockBase } from '../ports.js'
import { log } from '../util/log.js'

export async function claimCommand(cfg: BayConfig, feature: string) {
  const slot = await withLock(cfg.workspaceRoot, async () => claim(cfg, feature))
  const base = blockBase(cfg.portBase, cfg.slotSpan, slot)
  log(`功能 "${feature}" → 槽 ${slot}（块 ${base}）`)
  for (const [n, sp] of Object.entries(cfg.services)) log(`  ${n.padEnd(8)} ${base + sp.offset}`)
}
