import net from 'node:net'

// 按服务分段：某服务在某槽的端口 = 服务基址(主 dev/槽0) + 槽号
export function portOf(servicePort: number, slot: number): number { return servicePort + slot }

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

// 端口是否已被监听（连接探测，同时试 IPv4 与 IPv6 回环）。
// 比 bind 探测可靠：Windows 上 vite 等常监听 IPv6（::），单纯在 127.0.0.1 上 bind 测试会漏判。
export function portInUse(port: number): Promise<boolean> {
  const probe = (host: string) => new Promise<boolean>((resolve) => {
    const sock = net.connect({ port, host })
    const finish = (v: boolean) => { sock.destroy(); resolve(v) }
    sock.setTimeout(1500)
    sock.once('connect', () => finish(true))
    sock.once('timeout', () => finish(false))
    sock.once('error', () => resolve(false))
  })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean))
}
