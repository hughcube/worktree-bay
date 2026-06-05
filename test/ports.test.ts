import { describe, it, expect } from 'vitest'
import { blockBase, portOf, isPortFree } from '../src/ports.js'
import net from 'node:net'

describe('ports', () => {
  it('blockBase/portOf', () => {
    expect(blockBase(6000, 10, 1)).toBe(6010)
    expect(portOf(6000, 10, 1, 1)).toBe(6011)
    expect(portOf(6000, 10, 2, 4)).toBe(6024)
  })
  it('isPortFree=false 对已监听端口', async () => {
    const srv = net.createServer().listen(0, '127.0.0.1')
    await new Promise((r) => srv.once('listening', r))
    const port = (srv.address() as net.AddressInfo).port
    expect(await isPortFree(port)).toBe(false)
    srv.close()
  })
})
