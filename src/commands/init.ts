import fs from 'node:fs'
import path from 'node:path'
import { log, warn } from '../util/log.js'
import { t } from '../i18n.js'

// 引导生成一份 worktree-bay.config.json：扫描 cwd 子目录里的 git 仓预填为服务（按服务分配端口段）
export function initCommand(cwd: string): void {
  const target = path.join(cwd, 'worktree-bay.config.json')
  if (fs.existsSync(target)) { warn(t(`已存在 ${target}，未覆盖`, `${target} already exists, not overwriting`)); return }
  const repos: string[] = []
  for (const e of fs.readdirSync(cwd, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    if (fs.existsSync(path.join(cwd, e.name, '.git'))) repos.push(e.name)
  }
  let services: Record<string, unknown>
  if (repos.length) {
    services = {}
    repos.forEach((r, i) => { services[r] = { port: 6001 + i * 10, setup: 'echo TODO: 起本服务的命令', run: { test: ['echo', 'TODO'] } } })
  } else {
    services = {
      api: { port: 6001, copy: ['.env'], env: { '.env': { APP_PORT: '{port}' } }, setup: 'echo TODO: 起后端', run: { test: ['echo', 'TODO'] } },
      web: { port: 6011, upstream: { service: 'api', fallback: 'http://localhost:6001' }, env: { '.env.local': { VITE_API_BASE_URL: '{upstreamBase}' } }, setup: 'pnpm install', start: 'pnpm dev --port {port}' },
    }
  }
  const config = { workspaceRoot: cwd, maxSlots: 9, services }
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n')
  log(t(`✓ 已生成 ${target}`, `✓ wrote ${target}`))
  if (repos.length) log(t(`  识别到服务: ${repos.join(', ')}（每个分配一段端口，基址间隔 10）`, `  detected services: ${repos.join(', ')} (each gets a port segment, base ports 10 apart)`))
  else log(t(`  未识别到子 git 仓，已写入 api/web 示例模板`, `  no child git repos found; wrote an api/web example template`))
  log(t(`  下一步：补全各服务的 setup/env/upstream/exec/run。完整配置说明：worktree-bay skill`, `  next: fill in each service's setup/env/upstream/exec/run. Full config guide: worktree-bay skill`))
}
