import fs from 'node:fs'
import path from 'node:path'
import { log, warn } from '../util/log.js'

// 引导生成一份 worktree-bay.config.json：扫描 cwd 子目录里的 git 仓预填为服务
export function initCommand(cwd: string): void {
  const target = path.join(cwd, 'worktree-bay.config.json')
  if (fs.existsSync(target)) { warn(`已存在 ${target}，未覆盖`); return }
  const repos: string[] = []
  for (const e of fs.readdirSync(cwd, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    if (fs.existsSync(path.join(cwd, e.name, '.git'))) repos.push(e.name)
  }
  let services: Record<string, unknown>
  if (repos.length) {
    services = {}
    repos.slice(0, 9).forEach((r, i) => { services[r] = { offset: i + 1, setup: 'echo TODO: 起本服务的命令', run: { test: ['echo', 'TODO'] } } })
  } else {
    services = {
      api: { offset: 1, copy: ['.env'], env: { '.env': { APP_PORT: '{port}' } }, setup: 'echo TODO: 起后端', run: { test: ['echo', 'TODO'] } },
      web: { offset: 2, upstream: { service: 'api', fallback: 'http://localhost:6001' }, env: { '.env.local': { VITE_API_BASE_URL: '{upstreamBase}' } }, setup: 'pnpm install', start: 'pnpm dev --port {port}' },
    }
  }
  const config = { workspaceRoot: cwd, portBase: 6000, slotSpan: 10, maxSlots: 9, services }
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n')
  log(`✓ 已生成 ${target}`)
  if (repos.length) log(`  识别到服务: ${repos.join(', ')}（按目录预填，offset 自增）`)
  else log(`  未识别到子 git 仓，已写入 api/web 示例模板`)
  log(`  下一步：补全各服务的 setup/env/upstream/exec/run。完整配置说明：worktree-bay skill`)
}
