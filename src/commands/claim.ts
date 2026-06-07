import { BayConfig } from '../config.js'
import { withLock } from '../lock.js'
import { claim } from '../slots.js'
import { portOf } from '../ports.js'
import { log } from '../util/log.js'
import { color as c } from '../util/color.js'
import { t } from '../i18n.js'

export async function claimCommand(cfg: BayConfig, feature: string, description?: string) {
  const slot = await withLock(cfg.workspaceRoot, async () => claim(cfg, feature, { description }))
  log(c.bold(c.cyan(t(`功能 "${feature}" → 槽 ${slot}`, `feature "${feature}" → slot ${slot}`))))
  if (description) log(c.dim('  ' + description))
  for (const [n, sp] of Object.entries(cfg.services)) log(`  ${n.padEnd(8)} ${portOf(sp.port, slot)}`)
}
