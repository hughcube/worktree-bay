import { BayConfig } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { portOf } from '../ports.js'
import { log } from '../util/log.js'
import { t } from '../i18n.js'

export async function claimCommand(cfg: BayConfig, feature: string) {
  const slot = await withLock(cfg.workspaceRoot, async () => claim(cfg, feature))
  log(t(`功能 "${feature}" → 槽 ${slot}`, `feature "${feature}" → slot ${slot}`))
  for (const [n, sp] of Object.entries(cfg.services)) log(`  ${n.padEnd(8)} ${portOf(sp.port, slot)}`)
}
