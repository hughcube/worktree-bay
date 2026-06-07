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

核心模型：每个服务有自己的端口段（基址 = 主 dev/槽0）；一个功能占一个「槽位 N」，用到哪些服务就在哪些服务上各开一个 git worktree 挂进这个槽，该服务端口 = 基址 + N，自动错开，前端自动连到同槽的后端。

推荐工作流：
0. 摸清工作区（首次或拿不准时）：worktree_bay_doctor 列出全部服务及其仓、校验 git/配置/各仓是否就绪——这也是你获知「有哪些服务名可传给 up/add」的途径。
1. 起新功能：调用 worktree_bay_up，传功能名 + 要改的服务列表（如 ["api","lms"]）。它会自动占槽、为每个服务开 worktree、拷依赖、注入端口并起服务。
2. 定位代码：用 worktree_bay_path 拿某功能某服务的 worktree 绝对路径，进去改代码；或 worktree_bay_ls（JSON，含各 worktree 路径）总览全局。
3. 在某功能的某服务里跑测试/命令：worktree_bay_run（name 用配置里定义的，如 "test"）。
4. 收尾：分支合并后，先 worktree_bay_gc 看可回收项，再 worktree_bay_down 拆掉该功能（只传 feature=拆整功能；带 service=只拆某个服务）。

要点：
- 同一个功能从头到尾用同一个功能名（它同时是默认分支名）贯穿 up/path/run/down。
- 只起这个功能「实际要改」的服务，不要全起。不知道有哪些服务名时先调 worktree_bay_doctor。
- 拿不准当前状态时先调 worktree_bay_ls。
- worktree_bay_gc 默认只读（dry-run 列出建议），apply=true 才真删，且只删「已合并到主分支且工作区干净」的，安全保守、不会误删未完成的工作。
- worktree_bay_init 可在新工作区生成配置骨架（已存在则不覆盖）；worktree_bay_claim 只占槽并打印各服务端口、不建 worktree（一般直接用 up 即可）。
- 要写或修改 worktree-bay.config.json、或拿不准任何命令/参数/配置细节时，先调用 worktree_bay_skill 获取完整的使用与配置指南（含每个配置原语、模板变量、校验规则与完整示例）。`

interface Tool { name: string; description: string; inputSchema: object; toArgs: (a: Record<string, unknown>) => string[] }
const str = { type: 'string' }
export const TOOLS: Tool[] = [
  { name: 'worktree_bay_doctor', description: '体检并列出工作区全部服务及其仓目录、校验 git/配置/各仓是否就绪。起步前先调它，也是获知「有哪些服务名可传给 up/add」的途径。',
    inputSchema: { type: 'object', properties: {} }, toArgs: () => ['doctor'] },
  { name: 'worktree_bay_ls', description: '列出所有功能槽位与占用（JSON：每槽的功能名、已起服务及端口、各 worktree 绝对路径），用于总览当前并行开发状态',
    inputSchema: { type: 'object', properties: {} }, toArgs: () => ['ls', '--json'] },
  { name: 'worktree_bay_up', description: '为一个功能一次性起多个服务（自动占槽 + 各服务开 worktree，分支默认=功能名，前端自动接同槽后端）。并行开发新功能首选。',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str } }, required: ['feature', 'services'] },
    toArgs: (a) => ['up', String(a.feature), ...((a.services as string[]) ?? [])] },
  { name: 'worktree_bay_claim', description: '只为功能占一个槽位并打印各服务在该槽的端口，不开 worktree（一般直接用 up 即可；需要先预览端口/预约槽时用）',
    inputSchema: { type: 'object', properties: { feature: str }, required: ['feature'] },
    toArgs: (a) => ['claim', String(a.feature)] },
  { name: 'worktree_bay_add', description: '为功能在单个服务上开 worktree（branch 省略则用功能名）',
    inputSchema: { type: 'object', properties: { feature: str, service: str, branch: str }, required: ['feature', 'service'] },
    toArgs: (a) => ['add', String(a.feature), String(a.service), ...(a.branch ? [String(a.branch)] : [])] },
  { name: 'worktree_bay_path', description: '打印某功能某服务的 worktree 绝对路径——up 之后用它定位代码目录，再进去改文件',
    inputSchema: { type: 'object', properties: { feature: str, service: str }, required: ['feature', 'service'] },
    toArgs: (a) => ['path', String(a.feature), String(a.service)] },
  { name: 'worktree_bay_run', description: '在某功能某服务的运行体里跑预设命令（如 test），可透传额外参数',
    inputSchema: { type: 'object', properties: { feature: str, service: str, name: str, args: { type: 'array', items: str } }, required: ['feature', 'service', 'name'] },
    toArgs: (a) => ['run', String(a.feature), String(a.service), String(a.name), ...((a.args as string[]) ?? [])] },
  { name: 'worktree_bay_down', description: '拆除功能的 worktree：省略 service 拆整个功能的所有服务，传 service 只拆该服务（默认查脏/未推保护，force=true 强删）',
    inputSchema: { type: 'object', properties: { feature: str, service: str, force: { type: 'boolean' } }, required: ['feature'] },
    toArgs: (a) => ['rm', String(a.feature), ...(a.service ? [String(a.service)] : []), ...(a.force ? ['-f'] : [])] },
  { name: 'worktree_bay_gc', description: '合并感知回收：默认 dry-run 只列建议，apply=true 才实际删除「已合并且干净」的功能',
    inputSchema: { type: 'object', properties: { apply: { type: 'boolean' } } },
    toArgs: (a) => ['gc', ...(a.apply ? ['--apply'] : [])] },
  { name: 'worktree_bay_init', description: '在当前工作区生成 worktree-bay.config.json 骨架（扫描子 git 仓预填服务）；已存在则不覆盖。新工作区首次落地配置时用。',
    inputSchema: { type: 'object', properties: {} }, toArgs: () => ['init'] },
  { name: 'worktree_bay_skill', description: 'worktree-bay 完整使用与配置指南（每个命令、每个配置原语、模板变量、校验规则、完整示例）。写/改 worktree-bay.config.json 或拿不准细节时先调用它。',
    inputSchema: { type: 'object', properties: {} }, toArgs: () => ['skill'] },
]

function runCli(args: string[]): string {
  // 强制非交互：给 AI 的输出不带颜色/spinner 控制符，保留完整日志
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, WORKTREE_BAY_NONINTERACTIVE: '1' } })
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
