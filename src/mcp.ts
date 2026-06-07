import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import readline from 'node:readline'
import path from 'node:path'

// 轻量脚本式 MCP：手写 JSON-RPC over stdio，零依赖。客户端按需 spawn，stdin 关闭即退出，非常驻守护进程。
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.js')
const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version
const PROTOCOL_VERSION = '2024-11-05'

export const INSTRUCTIONS = `worktree-bay 是「功能 = 槽位」的并行开发编排器。在一个多服务工作区里并行开发多个功能、又不想让它们的端口/依赖/数据互相干扰时，用本服务的工具完成开发。

核心模型：每个服务有自己的端口段（基址 = 主 dev/槽0）；一个功能占一个「槽位 N」，用到哪些服务就在哪些服务上各开一个 git worktree 挂进这个槽，该服务端口 = 基址 + N，自动错开；前端自动连到同槽的后端。

三层职责（决定每个工具的边界）：
- worktree + 基础设施：worktree_bay_up/_add 建立（开 worktree、拷依赖、注入 .env、跑 setup 如 docker compose up），worktree_bay_down 销毁（teardown + 删 worktree）。
- dev server（前端等长进程）：up 时按配置自动「后台」拉起；worktree_bay_start/_stop/_restart 单独控制它，不动 worktree。
- 在运行体里执行命令：worktree_bay_run（如 test/migrate）。

推荐工作流：
0. 摸清工作区（首次/拿不准时）：worktree_bay_doctor —— 列出全部服务及其仓、校验就绪；这也是获知「有哪些服务名可传给 up」的途径。
1. 起新功能：worktree_bay_up，传功能名 + 要改的服务列表（如 ["api","lms"]）。自动占槽、开 worktree、拷依赖、注入端口、跑 setup，并把配了 start 的服务（如前端 dev server）后台拉起（日志在 .worktree-bay/logs/）。
2. 定位代码：worktree_bay_path 拿某功能某服务的 worktree 绝对路径进去改；或 worktree_bay_ls（JSON，含各 worktree 路径，▸run 标记 dev server 是否在跑）总览。
3. 跑命令/测试：worktree_bay_run（name 用配置里定义的，如 "test"）。
4. 控制 dev server（按需）：worktree_bay_restart 重启 / _stop 停 / _start 起——只影响 dev server，worktree 与代码不受影响。
5. 收尾：分支合并后先 worktree_bay_gc 看可回收项，再 worktree_bay_down 拆掉该功能（省略 service=整功能；带 service=只拆该服务）。

要点：
- 一个功能从头到尾用同一个功能名（= 默认分支名）。
- 每个新任务都用一个【新的功能名】调 worktree_bay_up，让工具自动占一个空槽——【不要】去 worktree_bay_ls 挑一个现成的槽来复用。ls 是给你看占用情况的，不是用来选槽复用的；复用别的功能已占的槽会破坏隔离、互相污染。唯一例外：你是在【继续同一个功能】之前没跑完的工作（功能名相同），这时 up 会幂等复用它自己的槽。
- 只起「实际要改」的服务，不要全起；不知道有哪些服务名先调 worktree_bay_doctor。
- 拿不准当前状态先调 worktree_bay_ls；dev server 起不来或报错就调 worktree_bay_logs 看日志尾部排障。
- worktree_bay_gc 默认只读（dry-run 列建议），apply=true 才真删，且只删「已合并到主分支且工作区干净」的，保守不误删。
- worktree_bay_init 在新工作区生成配置骨架（已存在则不覆盖）；worktree_bay_claim 只占槽并打印端口、不建 worktree（一般直接用 up 即可）。
- 要写/改 worktree-bay.config.json、或拿不准任何命令/参数/配置细节，先调 worktree_bay_skill 取完整指南（每个配置原语、模板变量、校验规则、完整示例）。`

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
  { name: 'worktree_bay_start', description: '启动功能的运行体（docker 容器 + node dev server 一起），不动 worktree。services 省略=该功能所有服务，也可列多个。',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str } }, required: ['feature'] },
    toArgs: (a) => ['start', String(a.feature), ...((a.services as string[]) ?? [])] },
  { name: 'worktree_bay_stop', description: '停止功能的运行体（停 docker 容器 + 杀 node dev server），保留 worktree。services 省略=全部，也可列多个。',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str } }, required: ['feature'] },
    toArgs: (a) => ['stop', String(a.feature), ...((a.services as string[]) ?? [])] },
  { name: 'worktree_bay_restart', description: '重启功能的运行体（停掉再起，docker + node 一起）。改了配置或端口卡住时用。services 省略=全部，也可列多个。',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str } }, required: ['feature'] },
    toArgs: (a) => ['restart', String(a.feature), ...((a.services as string[]) ?? [])] },
  { name: 'worktree_bay_down', description: '拆除 worktree：省略 services 拆整个功能（所有服务），给 services 只拆这些服务（默认查脏/未推保护，force=true 强删）',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str }, force: { type: 'boolean' } }, required: ['feature'] },
    toArgs: (a) => ['down', String(a.feature), ...((a.services as string[]) ?? []), ...(a.force ? ['-f'] : [])] },
  { name: 'worktree_bay_logs', description: '看功能各服务 dev server 的日志尾部——dev server 起不来/报错时排障用，免得自己拼日志路径。services 省略=全部；tail 指定行数（默认 40）；prev=true 看上一轮启动的日志（每次启动会滚动）。',
    inputSchema: { type: 'object', properties: { feature: str, services: { type: 'array', items: str }, tail: { type: 'number' }, prev: { type: 'boolean' } }, required: ['feature'] },
    toArgs: (a) => ['logs', String(a.feature), ...((a.services as string[]) ?? []), ...(a.tail ? ['--tail', String(a.tail)] : []), ...(a.prev ? ['--prev'] : [])] },
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
