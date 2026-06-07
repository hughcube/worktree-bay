import { describe, it, expect } from 'vitest'
import { portOf, isPortFree, portInUse } from '../src/ports.js'
import net from 'node:net'

describe('ports', () => {
  it('portOf = 服务基址 + 槽号', () => {
    expect(portOf(6001, 1)).toBe(6002)
    expect(portOf(6011, 2)).toBe(6013)
  })
  it('isPortFree=false 对已监听端口', async () => {
    const srv = net.createServer().listen(0, '127.0.0.1')
    await new Promise((r) => srv.once('listening', r))
    const port = (srv.address() as net.AddressInfo).port
    expect(await isPortFree(port)).toBe(false)
    srv.close()
  })
  it('portInUse：监听端口=true（连接探测），空闲端口=false', async () => {
    const srv = net.createServer().listen(0, '127.0.0.1')
    await new Promise((r) => srv.once('listening', r))
    const port = (srv.address() as net.AddressInfo).port
    expect(await portInUse(port)).toBe(true)
    srv.close()
    await new Promise((r) => srv.once('close', r))
    expect(await portInUse(port)).toBe(false)
  })
})
