import { describe, it, expect } from 'vitest'
import { mergeEnvText, resolveUpstreamBase } from '../src/engine.js'

describe('engine pure', () => {
  it('mergeEnvText 覆盖/追加/保留', () => { const o = mergeEnvText('A=1\nB=2\n', { A: '9', C: '3' }); expect(o).toContain('A=9'); expect(o).not.toContain('A=1'); expect(o).toContain('B=2'); expect(o).toContain('C=3') })
  it('resolveUpstreamBase：materialized→本槽端口；否则 fallback', () => {
    const cfg: any = { portBase: 6000, slotSpan: 10, services: { api: { offset: 1 } } }
    expect(resolveUpstreamBase(cfg, 1, { service: 'api', fallback: 'http://localhost:6001' }, true)).toBe('http://localhost:6011')
    expect(resolveUpstreamBase(cfg, 1, { service: 'api', fallback: 'http://localhost:6001' }, false)).toBe('http://localhost:6001')
  })
})
