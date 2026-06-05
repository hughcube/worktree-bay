import net from 'node:net'
export function blockBase(portBase: number, slotSpan: number, slot: number): number { return portBase + slot * slotSpan }
export function portOf(portBase: number, slotSpan: number, slot: number, offset: number): number { return blockBase(portBase, slotSpan, slot) + offset }
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}
