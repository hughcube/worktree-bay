# worktree-bay 使用与配置完全指南

`worktree-bay` 是配置驱动、与语言/技术栈无关的 **git worktree 槽位 + 端口编排器**，为多服务工作区的并行开发而生。

## 核心模型：功能 = 槽位

- 每个**服务**有自己的**端口段**：基址 `port` 就是它的主 dev 端口（= 槽 0），段为 `[port, port+maxSlots]`。
- 一个**功能**认领一个**槽位 `N`**（1..maxSlots）；功能用到哪些**服务**，就在那些服务各开一个 **git worktree** 挂进这个槽，该服务在本槽的端口 = `service.port + N`，与主 dev（槽 0）和其它槽天然错开、互不相撞。
- 同槽的前端服务自动把 api base 指向同槽的后端端口。
- 槽位占用从文件系统派生（看 `<repo>/.worktrees/s<N>-*` 是否存在），删了 worktree 槽自动空出。

---

## 安装

```bash
npm i -g worktree-bay        # 需要 Node >= 20
worktree-bay completion install   # 一键装 shell 补全（可选）
```

> **输出语言**：按系统区域（locale / `LANG` / `LC_*`）自动中英切换，识别不出时默认中文。可用 `WORKTREE_BAY_LANG=zh|en` 强制。错误提示均为自然语言并附「应该怎么做」的建议。

---

## 命令大全

| 命令 | 作用 |
|---|---|
| `worktree-bay init` | 在当前工作区生成 `worktree-bay.config.json`（扫描子 git 仓预填服务） |
| `worktree-bay doctor` | 体检：git 是否可用、配置是否有效、各服务仓是否就绪 |
| `worktree-bay up <feature> <service...>` | **最常用**：一条命令为功能起多个服务（自动占槽 + 各服务开 worktree，分支默认 = 功能名） |
| `worktree-bay claim <feature>` | 只占一个槽、打印各服务在该槽的端口（不开 worktree） |
| `worktree-bay add <feature> <service> [branch] [base]` | 为功能在单个服务开 worktree。`branch` 省略 = 功能名；`base` 省略 = `origin/<主分支>` |
| `worktree-bay ls [--json]` | 列出所有槽位：功能名、已起服务及端口；`--json` 输出结构化数据（含 worktree 绝对路径，便于脚本/AI 消费）。合并状态由 `gc` 判定，`ls` 不查（避免每次都 `git fetch`） |
| `worktree-bay path <feature> <service>` | 打印某服务 worktree 的绝对路径（可 `cd $(worktree-bay path f api)`） |
| `worktree-bay run <feature> <service> <name> [args...]` | 在某服务运行体里跑配置的 `run.<name>`（如 test），透传 args |
| `worktree-bay sh <feature> <service>` | 进入某服务运行体的 shell |
| `worktree-bay start <feature> [services...]` | 启动功能的运行体（docker 容器 + node dev server 一起）；**省略 = 全部**，也可列多个。不动 worktree |
| `worktree-bay stop <feature> [services...]` | 停止功能的运行体（停 docker + 杀 node dev server）；省略 = 全部，可列多个。保留 worktree |
| `worktree-bay restart <feature> [services...]` | 重启运行体（停掉再起）；省略 = 全部，可列多个 |
| `worktree-bay down <feature> [services...]` | 拆除 worktree（停运行体 + teardown + 删 worktree）；**省略 services = 整功能**，也可列多个只拆这些。默认查脏/未推保护，`-f` 强删 |
| `worktree-bay gc [--apply]` | 合并感知回收：默认 dry-run 只列建议，`--apply` 才删「已合并且干净」的 |
| `worktree-bay completion <install\|bash\|zsh\|fish>` | `install` 一键装进 shell；或打印补全脚本 |
| `worktree-bay mcp` | 启动 MCP 服务（stdio，轻量脚本，客户端按需 spawn），供 AI 调用 |
| `worktree-bay skill` | 打印本指南 |
| `worktree-bay version` / `--version` | 显示版本号 |
| `worktree-bay help [命令]` | 帮助；`help <命令>` 看单命令用法 |

典型流程：

```bash
worktree-bay up drill-fix api lms      # 起整个功能（api+前端，分支都叫 drill-fix）
worktree-bay ls
worktree-bay run drill-fix api test    # 跑测试
worktree-bay down drill-fix            # 拆掉
worktree-bay gc                        # 回收已合并的
```

---

## 配置详解：`worktree-bay.config.json`

放在工作区根目录，工具自下而上查找（或用环境变量 `WORKTREE_BAY_CONFIG` 指定绝对路径）。

### 顶层字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `workspaceRoot` | string | **非必选**，工作区根，各服务仓在其下；**默认 = config 文件所在目录**（即省略时等同 `"."`）。可填相对路径（相对 config 目录解析，不受进程 cwd 影响）或绝对路径 |
| `maxSlots` | number | 最大并行功能数（每个服务预留 `maxSlots` 个端口），如 `9` |
| `services` | object | 服务名 → 服务定义（见下） |

**端口模型（按服务分段）**：每个服务有自己的端口段，基址 `port` 就是它的主 dev 端口（= 槽 0）；某服务在某槽 N 的端口 = `service.port + N`（槽 1..maxSlots）。
例：`api.port=6001` → 槽 1 用 6002、槽 2 用 6003…；`lms.port=6011` → 槽 1 用 6012…。**服务数量无上限**，只要各服务端口段（`[port, port+maxSlots]`）互不重叠即可。

### 服务定义原语

| 原语 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `port` | ✅ | number | 本服务端口段基址（= 主 dev/槽0 端口）；各服务的段 `[port, port+maxSlots]` 互不重叠 |
| `repo` | | string | 仓库目录名（相对 workspaceRoot），**默认 = 服务名** |
| `vars` | | object | 自定义模板变量，值里可引用基础变量，如 `{ "project": "myapi-{slug}" }` |
| `copy` | | string[] | 挂入时从主 checkout **递归拷贝**到 worktree 的文件/目录（含依赖目录，如 `vendor`）。含符号链接也安全（会跟随拷目标内容） |
| `env` | | object | dotenv 注入：`{ "文件名": { "KEY": "值模板" } }`，把键值**合并**进该文件（保留其它行，文件不存在则建） |
| `upstream` | | object | 声明依赖的上游服务：`{ "service": "api", "fallback": "http://localhost:6001" }`，产出 `{upstreamBase}` 变量 |
| `setup` | | string | 挂入后执行的 shell 命令（创建/装好运行体，如 `docker compose up -d`、`pnpm install`）。`up` 时跑 |
| `teardown` | | string | 拆除时执行的 shell 命令（销毁运行体，如 `docker compose down -v`）。`down`/`rm`/`gc` 时跑 |
| `start` | | string | 长进程 dev server（如 `pnpm dev`）。`up` 时**自动后台启动**（detach + 日志落 `.worktree-bay/logs/`），按端口追踪 pid；由 `start`/`stop`/`restart` 控制，`ls` 行首 `●` 标在跑（绿）/未跑（灰） |
| `stop` | | string | 停止该服务 infra 运行体的 shell（如 `docker compose stop`）。供 `stop`/`restart` 用——让 docker 容器能「停而不毁」；`start` 时对配了它的服务重跑 `setup` 幂等恢复 |
| `exec` | | string[] | 透传命令模板（argv 数组），`{cmd...}` 是 argv splice 占位，防 shell 注入。如 `["docker","exec","-i","{project}-app-1","{cmd...}"]` |
| `run` | | object | 命名命令：`{ "test": ["composer","run","test"] }`，供 `worktree-bay run <feature> <service> test` 调用 |

### 模板变量

`vars` / `copy` / `env` 的值 / `setup` / `teardown` / `start` / `exec` 里都可用 `{变量}`：

| 变量 | 含义 |
|---|---|
| `{slot}` | 槽位号 |
| `{port}` | 本服务端口 `service.port + slot` |
| `{slug}` | worktree 目录名 `s<slot>-<分支归一化>` |
| `{worktree}` | worktree 绝对路径 |
| `{repo}` | 服务仓绝对路径 |
| `{upstreamBase}` | 上游服务地址（同槽上游已起则为 `http://localhost:<上游端口>`，否则 `upstream.fallback`） |
| `{cmd...}` | 透传命令的 argv splice（仅 `exec` 数组里用） |
| 自定义 | `vars` 里声明的，如 `{project}` |

### 加载时强制校验

1. 各服务端口段 `[port, port+maxSlots]` 互不重叠（任意两服务 `|portA - portB| > maxSlots`）；
2. `port` 必填且为正数；
3. `upstream.service` 必须存在于 `services`；
4. 所有模板里引用的 `{var}` 可解析（基础变量或本服务 vars 已声明）；
5. `repo` 指向的目录存在。
任一不满足则报错退出。

### 完整示例（docker 后端 + vite 前端）

```jsonc
{
  "workspaceRoot": "/path/to/workspace",
  "maxSlots": 9,
  "services": {
    "api": {
      "port": 6001,
      "vars": { "project": "myapi-{slug}" },
      "copy": [".env", "vendor"],
      "env": { ".env": { "APP_PORT": "{port}", "CACHE_PREFIX": "dev:{slug}:" } },
      "setup": "docker compose -p {project} up -d",
      "stop": "docker compose -p {project} stop",
      "teardown": "docker compose -p {project} down -v",
      "exec": ["docker", "exec", "-i", "{project}-app-1", "{cmd...}"],
      "run": { "test": ["composer", "run", "test"], "migrate": ["php", "artisan", "migrate"] }
    },
    "web": {
      "port": 6011,
      "upstream": { "service": "api", "fallback": "http://localhost:6001" },
      "env": { ".env.local": { "VITE_API_BASE_URL": "{upstreamBase}" } },
      "setup": "pnpm install",
      "start": "pnpm dev --port {port}"
    }
  }
}
```

> 依赖处理：后端 `copy: ["vendor"]`（拷已装好的，免重装）；前端不拷 `node_modules`，用 `setup: "pnpm install"`（暖 store 下近乎瞬时，且躲开符号链接拷贝坑）。两种都支持，纯配置选择。

---

## 命令边界（三层）

| 层 | 是什么 | 建立 | 控制运行 | 销毁 |
|---|---|---|---|---|
| ① worktree + 基础设施 | git worktree + `copy`/`env` + `setup` 起的东西 | `up` / `add` | — | `down` / `rm` / `gc`（`teardown`） |
| ② 运行体(runtime) | docker 容器(infra) + node dev server(`start`) | `up` 顺带起 | **`start` / `stop` / `restart`**（docker+node 一起，不动 worktree） | `down`（一并停） |
| ③ 在运行体里执行 | 跑命令 / 开 shell | — | `run` / `sh` | — |

- `up`：建 worktree+infra（首次）并起运行体；**重入 = 恢复运行体**（docker 挂了重跑 `up` 能拉回来，等价 `start`）。
- 整套 runtime/teardown 命令统一为「一个动词 + `[services...]`（省略=全部）」：`start` / `stop` / `restart` / `down`。
- `up`（创建，服务必填）↔ `down`（拆除，服务可省=整功能）。`add` 是「单服务 + 自定义分支/基点」的精细创建，其反操作 = `down <feature> <service>`。

## 工作原理要点

- **占用真相 = 文件系统**：扫各服务 `.worktrees/s<N>-*`；`.worktree-bay-slots.json` 只是「功能名→槽号」标签账本（预约）。
- **dev server 托管**：`start` 进程后台 detach 启动、日志落 `.worktree-bay/logs/`、按端口追踪真实 pid；`ls` 行首 `●` 标在跑（绿）/未跑（灰）；`stop`/`down` 按端口可靠停。
- **运行状态判断 = 端口**：`ls` 的 `running`、`stop` 的「是否真在跑」一律按约定端口是否被监听判（覆盖 docker / 托管 dev server / 外部手起三类），不依赖 pid 账本（dir 形态会漂移、docker 无账本记录）。`stop` 对每个服务都给状态：已停 / 端口空闲（docker 钩子仍幂等跑一遍）/ 外部未托管需手动停。
- **并发安全**：`claim/add/up/rm/down/gc` 全程持工作区原子锁。
- **前端自接后端**：前端有 `upstream` 且同槽该上游服务的 worktree 已建，则 `{upstreamBase}` = 本槽上游端口；否则用 `fallback`。所以**联调时先 `up`/`add` 后端，再起前端**。
- **合并感知回收**：`gc` 先 `git fetch`，用 `merge-base --is-ancestor` 判断是否并入主分支；**只在「已合并 + 工作区干净 + 无未推」时才自动删**，判不准一律保守不删、只标记。

---

## 给 AI（MCP）

`worktree-bay mcp` 暴露工具：`worktree_bay_doctor / ls / up / claim / add / path / run / start / stop / restart / down / gc / init / skill`。`doctor` 列出全部服务（AI 借此得知服务名）；`ls` 以 JSON 返回 `[{slot, feature(可 null), services:[{service, port, dir, running}]}]`（含各 worktree 绝对路径、布尔 `running`）；`path` 给某功能某服务的 worktree 目录；`start/stop/restart` 控制运行体（docker+node）；`down` 省略 services 拆整功能、给 services 只拆这些。要写或修改 `worktree-bay.config.json`、或拿不准命令/配置细节时，调用 `worktree_bay_skill` 取本指南全文。

## 常见坑

- 前端 api base 没指对：确认先起了同槽后端，且前端 `upstream.service` 写的是后端服务名。
- `add` 报 `origin/...` invalid：该仓没有 origin 或主分支，显式传 `base`（如 `HEAD`）。
- 槽位不够（maxSlots）：`worktree-bay gc` 回收已合并的，或 `down` 拆掉用完的。
