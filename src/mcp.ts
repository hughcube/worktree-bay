import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'

// 轻量脚本式 MCP：手写 JSON-RPC over stdio，零依赖。客户端按需 spawn，stdin 关闭即退出，非常驻守护进程。
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js')
const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version
const PROTOCOL_VERSION = '2024-11-05'

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

interface Tool { name: string; description: string; inputSchema: object; toArgs: (a: Record<string, unknown>) => string[] }
const str = { type: 'string' }
export const TOOLS: Tool[] = [
  { name: 'worktree_bay_ls', description: '列出所有功能槽位与占用（功能名、端口块、已起服务及端口、是否已并入主分支）',
    inputSchema: { type: 'object', properties: {} }, toArgs: () => ['ls'] },
  { name: 'worktree_bay_up', description: '为一个功能一次性起多个服务（自动占槽 + 各服务开 worktree，分支默认=功能名，前端自动接同槽后端）。并行开发新功能首选。',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str } }, required: ['feature', 'services'] },
    toArgs: (a) => ['up', String(a.feature), ...((a.services as string[]) ?? [])] },
  { name: 'worktree_bay_add', description: '为功能在单个服务上开 worktree（branch 省略则用功能名）',
    inputSchema: { type: 'object', properties: { feature: str, service: str, branch: str }, required: ['feature', 'service'] },
    toArgs: (a) => ['add', String(a.feature), String(a.service), ...(a.branch ? [String(a.branch)] : [])] },
  { name: 'worktree_bay_run', description: '在某功能某服务的运行体里跑预设命令（如 test），可透传额外参数',
    inputSchema: { type: 'object', properties: { feature: str, service: str, name: str, args: { type: 'array', items: str } }, required: ['feature', 'service', 'name'] },
    toArgs: (a) => ['run', String(a.feature), String(a.service), String(a.name), ...((a.args as string[]) ?? [])] },
  { name: 'worktree_bay_down', description: '拆除整个功能的所有服务 worktree（默认查脏/未推保护，force=true 强删）',
    inputSchema: { type: 'object', properties: { feature: str, force: { type: 'boolean' } }, required: ['feature'] },
    toArgs: (a) => ['down', String(a.feature), ...(a.force ? ['-f'] : [])] },
  { name: 'worktree_bay_gc', description: '合并感知回收：默认 dry-run 只列建议，apply=true 才实际删除「已合并且干净」的功能',
    inputSchema: { type: 'object', properties: { apply: { type: 'boolean' } } },
    toArgs: (a) => ['gc', ...(a.apply ? ['--apply'] : [])] },
]

function runCli(args: string[]): string {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  return [r.stdout, r.stderr].filter(Boolean).join('\n').trim() || '(无输出)'
}

interface Rpc { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> }
export function handle(msg: Rpc): object | null {
  const { id, method, params } = msg
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'worktree-bay', version: VERSION }, instructions: INSTRUCTIONS } }
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } }
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === (params?.name as string))
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool: ' + params?.name } }
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: runCli(tool.toArgs((params?.arguments as Record<string, unknown>) ?? {})) }] } }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} }
  if (method?.startsWith('notifications/')) return null
  if (id !== undefined) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } }
  return null
}

export function startMcp(): void {
  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    const t = line.trim(); if (!t) return
    let msg: Rpc
    try { msg = JSON.parse(t) } catch { return }
    const res = handle(msg)
    if (res) process.stdout.write(JSON.stringify(res) + '\n')
  })
}
