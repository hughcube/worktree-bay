import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js')
const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

// 工具实现：直接调底层 worktree-bay CLI 并捕获输出返回，复用全部逻辑
function runCli(args: string[]): { content: { type: 'text'; text: string }[] } {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  const text = [r.stdout, r.stderr].filter(Boolean).join('\n').trim() || '(无输出)'
  return { content: [{ type: 'text' as const, text }] }
}

export const INSTRUCTIONS = `worktree-bay 是「功能 = 槽位」的并行开发编排器。当你需要在一个多服务工作区里并行开发多个功能、又不想让它们的端口/依赖/数据互相干扰时，用本服务的工具来完成开发工作。

核心模型：一个功能占一个「槽位」→ 得到一个端口块；该功能用到哪些服务，就在哪些服务上各开一个 git worktree 挂进这个槽，端口自动错开，前端自动连到同槽的后端。

推荐工作流：
1. 起新功能：调用 worktree_bay_up，传功能名 + 要改的服务列表（如 ["api","lms"]）。它会自动占槽、为每个服务开 worktree、拷依赖、注入端口并起服务。
2. 查看在跑的功能：worktree_bay_ls。
3. 在某功能的某服务里跑测试/命令：worktree_bay_run（name 用配置里定义的，如 "test"）。
4. 收尾：分支合并后，先 worktree_bay_gc 看可回收项，再 worktree_bay_down 拆掉该功能。

要点：
- 同一个功能从头到尾用同一个功能名（它同时是默认分支名）贯穿 up/run/down。
- 只起这个功能「实际要改」的服务，不要全起。
- 拿不准当前状态时先调 worktree_bay_ls。
- worktree_bay_gc 默认只读（dry-run 列出建议），apply=true 才真删，且只删「已合并到主分支且工作区干净」的，安全保守、不会误删未完成的工作。`

export function createServer(): McpServer {
  const server = new McpServer({ name: 'worktree-bay', version: VERSION }, { instructions: INSTRUCTIONS })

  server.tool('worktree_bay_ls', '列出所有功能槽位与占用（每槽：功能名、端口块、已起服务及端口、是否已并入主分支）', {},
    async () => runCli(['ls']))

  server.tool('worktree_bay_up', '为一个功能一次性起多个服务（自动占槽 + 各服务开 worktree，分支默认 = 功能名，前端自动接同槽后端）。并行开发新功能首选。', {
    feature: z.string().describe('功能名（同时作为默认分支名）'),
    services: z.array(z.string()).describe('要起的服务名列表，如 ["api","lms"]'),
  }, async ({ feature, services }) => runCli(['up', feature, ...services]))

  server.tool('worktree_bay_add', '为功能在单个服务上开 worktree（branch 省略则用功能名）', {
    feature: z.string(), service: z.string(), branch: z.string().optional(),
  }, async ({ feature, service, branch }) => runCli(['add', feature, service, ...(branch ? [branch] : [])]))

  server.tool('worktree_bay_run', '在某功能某服务的运行体里跑预设命令（如 test），可透传额外参数', {
    feature: z.string(), service: z.string(),
    name: z.string().describe('配置里 run.<name> 的名字，如 test'),
    args: z.array(z.string()).optional(),
  }, async ({ feature, service, name, args }) => runCli(['run', feature, service, name, ...(args ?? [])]))

  server.tool('worktree_bay_down', '拆除整个功能的所有服务 worktree（默认查脏/未推保护，force=true 强删）', {
    feature: z.string(), force: z.boolean().optional(),
  }, async ({ feature, force }) => runCli(['down', feature, ...(force ? ['-f'] : [])]))

  server.tool('worktree_bay_gc', '合并感知回收：默认 dry-run 只列建议，apply=true 才实际删除「已合并且干净」的功能', {
    apply: z.boolean().optional(),
  }, async ({ apply }) => runCli(['gc', ...(apply ? ['--apply'] : [])]))

  return server
}

export async function startMcp(): Promise<void> {
  await createServer().connect(new StdioServerTransport())
}
