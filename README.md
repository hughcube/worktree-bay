# worktree-bay

[![npm version](https://img.shields.io/npm/v/worktree-bay.svg)](https://www.npmjs.com/package/worktree-bay)
[![license](https://img.shields.io/npm/l/worktree-bay.svg)](./LICENSE)

> 配置驱动、与语言/技术栈无关的 **git worktree 槽位 + 端口编排器**——为多服务并行开发而生。

一个功能来了，先**占一个槽位**，用到哪个服务就在哪个服务开一个 worktree 挂进这个槽。同一槽里的所有服务共享一套**端口块**、各自独立进程，前端自动接上同槽的后端。工具替你管好 worktree 路径、端口分配、依赖、`.env` 注入与回收。

## 为什么

在 monorepo / 多仓工作区里并行开发多个功能时，git worktree 能隔离代码，但隔离不了运行时——端口会撞、依赖要重装、前端连不上你本地起在偏移端口的后端。`worktree-bay` 在 worktree 之上补一层「**功能 = 槽位**」的编排：

- **端口不撞**：每个功能占一个槽 `N`，得到端口块 `6000 + N*10`，块内各服务按固定偏移取端口。
- **免重装**：依赖从主 checkout 拷贝（或按服务自定义安装命令），不必每个 worktree 从头装。
- **前端自接后端**：前端按「同槽上游服务」自动把 api base 指向本槽后端端口。
- **不泄漏**：槽位占用从文件系统派生；`gc` 合并感知回收（已并入主分支且干净才删，保守不误删）。

## 安装

```bash
npm i -g worktree-bay
```

需要 Node ≥ 20。

## 快速上手

```bash
# 一条命令起整个功能：自动占槽 + 在 api/lms 上开 worktree（分支默认 = 功能名）
worktree-bay up drill-fix api lms

# 看占用
worktree-bay ls

# 在服务运行体里跑命令（透传）
worktree-bay run drill-fix api test

# 拆除整个功能（默认查脏/未推保护，-f 强删）
worktree-bay down drill-fix

# 回收已合并的（默认 dry-run，--apply 实际执行）
worktree-bay gc
```

> 需要更细的控制：`claim <feature>` 单独占槽、`add <feature> <service> [branch]` 单加一个服务（branch 可自定义，省略则用功能名）、`rm <feature> [service]` 拆单个服务。

## 配置

在工作区根放一份 `worktree-bay.config.json`，集中声明所有服务。工具运行时自下而上查找它（或用环境变量 `WORKTREE_BAY_CONFIG` 指定）。

```jsonc
{
  "workspaceRoot": "/path/to/workspace",
  "portBase": 6000,
  "slotSpan": 10,
  "maxSlots": 9,
  "services": {
    "api": {
      "offset": 1,
      "vars": { "project": "myapi-{slug}" },
      "copy": [".env", "vendor"],                                  // 从主 checkout 递归拷文件/目录
      "env": { ".env": { "APP_PORT": "{port}" } },                 // 合并键值进 dotenv（保留其它键）
      "setup": "docker compose -p {project} up -d",                // 挂入时执行
      "teardown": "docker compose -p {project} down -v",           // 拆除时执行
      "exec": ["docker", "exec", "-i", "{project}-app-1", "{cmd...}"], // 透传模板（argv）
      "run": { "test": ["composer", "run", "test"] }               // 命名命令
    },
    "lms": {
      "offset": 2,
      "upstream": { "service": "api", "fallback": "http://localhost:6001" }, // → {upstreamBase}
      "env": { ".env.dev.local": { "VITE_API_BASE_URL": "{upstreamBase}" } },
      "setup": "pnpm install",
      "start": "pnpm dev --port {port}"                            // 长进程：只打印命令，交你自起
    }
  }
}
```

### 原语

| 原语 | 说明 |
|---|---|
| `offset`（必填） | 本服务端口 = `块基址 + offset`，各服务互不相同、`1 ≤ offset < slotSpan` |
| `repo` | 仓库目录名（相对 workspaceRoot），默认 = 服务名 |
| `vars` | 自定义模板变量 |
| `copy` | 从主 checkout 递归拷贝的文件/目录（含依赖目录） |
| `env` | 按文件合并 dotenv 键值，文件不存在则建 |
| `upstream` | 声明依赖的上游服务，产出 `{upstreamBase}` |
| `setup` / `teardown` | 挂入 / 拆除时执行的 shell 命令 |
| `start` | 长进程命令，只打印不阻塞 |
| `exec` | 透传命令模板（argv 数组，`{cmd...}` splice） |
| `run` | 命名命令（argv 数组），供 `worktree-bay run <feature> <service> <name>` |

### 模板变量

`{slot}` `{blockBase}` `{port}` `{slug}` `{worktree}` `{repo}` `{upstreamBase}` `{cmd...}`，以及 `vars` 里自定义的。

## 工作原理

- **槽位 = 端口块**：功能占槽 `N`（1..`maxSlots`）→ 端口块 `portBase + N*slotSpan`；块内服务按 `offset` 取端口。
- **占用从文件系统派生**：槽是否被占，看各服务 `<repo>/.worktrees/s<N>-*` 目录是否存在；`.worktree-bay-slots.json` 只是「功能名 → 槽号」的标签账本（预约）。删了 worktree，槽自动空出。
- **并发安全**：`claim/add/rm/gc` 全程持工作区原子锁。
- **前端自接**：前端有 `upstream` 时，若同槽已起该上游服务的 worktree，就把 api base 指向本槽端口；否则用 `fallback`。
- **合并感知回收**：`gc` 先 `git fetch`，用 `merge-base --is-ancestor` 判断是否并入主分支；**只在「已合并 + 工作区干净 + 无未推」时才自动删**，判不准一律保守不删、只标记。

## Shell 补全

一条命令装好（自动探测 shell、幂等写入对应 rc；fish 直接写补全目录）：

```bash
worktree-bay completion install
```

执行 `source ~/.bashrc`（或重开终端）即可 tab 补全子命令、功能名、服务名。也可手动：`worktree-bay completion bash`（打印脚本，自行接入）。

## MCP（让 AI 直接用）

内置一个 MCP 服务，让 AI（Claude Code 等）通过 MCP 调用 worktree-bay 完成并行开发，并内置工作流指导（告诉 AI 何时用 up/ls/run/down/gc）。

启动：`worktree-bay mcp`（stdio）。在 Claude Code 里注册：

```json
{
  "mcpServers": {
    "worktree-bay": { "command": "worktree-bay", "args": ["mcp"] }
  }
}
```

> 服务在哪个工作区目录启动，就用哪个目录的 `worktree-bay.config.json`（或设 `WORKTREE_BAY_CONFIG`）。暴露的工具：`worktree_bay_up / ls / add / run / down / gc`。

## 许可证

[MIT](./LICENSE)
