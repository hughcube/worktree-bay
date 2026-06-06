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
