# 跨子项目 Worktree 槽位编排方案 — 设计文档

- 日期：2026-06-05
- 范围：workspace 级（rqapp 元仓库 + 各子项目）
- 状态：设计定稿（经自审 R1–R5 + Codex 对抗评审两轮）

> ⚠️ **演进说明（已部分过时）**：本文是落地前的原始设计稿，**端口模型已变更**。当前实现改为「**按服务分段**」：每个服务有自己的端口段，基址 `service.port` = 主 dev/槽0，某服务在槽 N 的端口 = `service.port + N`；不再有 `portBase` / `slotSpan` / `offset` / `{blockBase}` / 「端口块」这些概念，服务数量也不再受 `slotSpan` 限制。下文 §2 端口块方案、§3.1 配置 schema、§3.4 模板变量等仍是旧模型，仅作历史参考——**以 `README.md`、`skill.md` 与源码为准**。

燃典教务平台是多子项目工作区：后端 `api/`，前端 `lms / console / csp / pc / h5`。一个功能常跨多个子项目同时改。当前用 git worktree 并行开发时存在两类问题：

1. **重（最初痛点 B）**：api 每个 worktree 各自跑一次 `composer install`（前端则 `pnpm install`），启动慢。本方案改为**从主 checkout 拷贝已装好的依赖**（§5），免装、可离线（磁盘成本用户确认可接受）。
2. **跨子项目端口联动**：前端 dev 默认连本地 api `localhost:6001`（见 §5 实测）。一旦 api 跑在 worktree 的偏移端口，前端就连不上，需要一种机制把"同一个功能"的各子项目 worktree 在端口上粘合起来。

**实测确认（不改的部分）**：
- api 测试库已天然隔离——`composer.json` 的 `test/test:parallel` 脚本把 DB 写死连本栈 compose 服务 `pgsql`、库 `rqapi_test`，与 `.env` 的远程 dev 无关。
- api dev 运行时连远程 dev 转发（`host.docker.internal:42003` → `xrapp_dev`），各 worktree 共享；不在 worktree 内乱跑 `migrate` 即可，本方案不改这一点。

## 2. 核心模型：功能 = 槽位

一个功能来了，**先认领一个槽位 `N`**；**用到哪个子项目，就在那个子项目开 worktree 并挂进槽 `N`**，没用到的不起。挂进同一槽的所有服务用同一套端口块、各自独立进程。槽位号 `N` 是唯一的协调令牌——前端无需中心登记表即可按公式算出"本槽 api 在哪"。

### 端口块方案

- 槽 `N ∈ [1, 9]` → 端口块 `BASE = 6000 + N*10`（槽1=6010、槽9=6090，全在 CLAUDE.md 已划的 6000–6099 段内）。
- 块内固定偏移：

  | 服务 | 偏移 | 槽1 示例 |
  |---|---|---|
  | api（gateway 对外） | BASE+1 | 6011 |
  | lms | BASE+2 | 6012 |
  | pc | BASE+3 | 6013 |
  | csp | BASE+4 | 6014 |
  | console | BASE+5 | 6015 |
  | h5 | BASE+6 | 6016 |

- 主 checkout 不动（api 仍 6001，相当于槽 0）。
- 一个槽号即确定所有服务端口；前端按 `本槽 api = BASE+1` 自接。

## 3. 组件

### 3.0 形态：一个独立的、配置驱动的通用 CLI（Node/TS）

抽成**单一独立、与语言/技术栈无关的通用工具**，不内置任何 PHP/docker/vendor 知识。决策：

- **语言**：Node + TypeScript。跨平台稳（Windows MSYS 友好）；JSON 状态、git 合并检测、端口探测、跨仓编排这些非平凡逻辑用 JS 远比 bash 省心。
- **名称**：项目名 = 命令名 = **`worktree-bay`**（"工位/泊位"隐喻：功能停进一个 bay，服务并排插入；将发布 npm）。
- **归属**：**独立项目**，代码放 `~/Data/ms/worktree-bay`（= `C:/Users/hugh.li/Data/ms/worktree-bay`），自有 git 仓 + 独立 GitHub 仓库（**用户自行 push**，本流程只本地 `init`/`commit`，不推）。可开源。
- **定位（诚实收窄，Codex#11）**：worktree-bay 是**"配置驱动的 worktree 槽位 + 端口编排器"**，**dotenv / HTTP-upstream / 一仓一服务**取向，靠 `setup`/`teardown` 等 **shell hook 扩展**。不内置 PHP/docker/vendor 知识（`composer`/`vendor`/`docker`/`pnpm`/`VITE_*` 全是配置里的字符串值），但**不宣称"完整语言无关"**——结构化配置文件、多 service 单仓、非端口资源等不在当前原语覆盖内，必要时走 hook 或后续扩展。
- **配置模型**：工作区一份外部配置 `rqapp/worktree-bay.config.json`，集中声明所有服务；子项目仓零侵入。
- **调用**：统一命令 `worktree-bay`；全局 link（`pnpm link`/`npm i -g`）暴露，任意 cwd 可用。
- **Tab 补全**：`worktree-bay completion <bash|zsh|fish>` 打印补全脚本 + 隐藏 `worktree-bay --complete`，动态补全子命令、`<service>`（读配置）、`<feature>`（读标签）。
- 不做 MCP server（YAGNI）。设计文档随工具落地迁入 worktree-bay 仓（现暂存 api/docs）。

### 3.1 通用配置 schema（`rqapp/worktree-bay.config.json`）

每个服务用一组**声明式原语**描述"挂进槽时做什么"，全部支持模板变量（§3.4）。依赖**拷贝或重装由各服务自选**：`vendor` 拷（composer 即便暖缓存也要跑 autoload dump，拷更省）；前端 `node_modules` **不拷、走 `pnpm install`**（暖 store 下近乎瞬时，且躲开 pnpm 符号链接树的拷贝坑——见 §5 R3）。

```jsonc
{
  "workspaceRoot": "C:/Users/hugh.li/Data/rqapp",
  "portBase": 6000, "slotSpan": 10, "maxSlots": 9,
  "services": {
    "api": {
      // repo 可省，默认 = 服务名 "api"
      "offset": 1,
      "vars": { "project": "rqapi-{slug}" },
      "copy": [".env", "vendor"],                            // 文件+目录,逐个从主 checkout 递归拷
      "env": {                                               // 注入(保留其它键)
        ".env": { "APP_EXPOSE_PORT": "{port}", "REDIS_PREFIX": "rq:dev:{slug}:" }
      },
      "setup": "docker compose -p {project} up -d",
      "teardown": "docker compose -p {project} down -v",   // 可按 {project} 在 repo 根跑，不绑 worktree（Codex#12）
      "exec": ["docker","exec","-i","{project}-app-1","{cmd...}"],   // argv 数组；{cmd...} 是 argv splice，非字符串插值（Codex#8）
      "run": { "test": ["composer","run","test:parallel"], "artisan": ["php","artisan"] }
    },
    "lms": {
      "offset": 2,
      "upstream": { "service": "api", "fallback": "http://localhost:6001" },   // → {upstreamBase}
      "env": { ".env.dev.local": { "VITE_SERVICE_BASE_URL": "{upstreamBase}" } },
      "setup": "pnpm install",                               // 暖 store 重装(不拷 node_modules)
      "start": "pnpm dev --port {port}"                      // 长进程:打印命令让用户自起
    }
    // pc/csp/console/h5 同 lms，仅 offset 与 env 里的变量名不同（VITE_SERVICE_BASE_URL / VITE_API_BASE_URL，见 §5）
  }
}
```

原语清单：`offset`（必填）；`repo`（可选，默认=服务名；**当前假设一仓一服务**，多 service 单仓留作未来，Codex#13）；`vars`（自定义变量）；`copy`（从主 checkout 递归拷的文件/目录；**仅 dotenv/二进制依赖等"按字节拷即可"的内容**）；`env`（**仅 dotenv key=value** 合并，保留其它键，文件不存在则建；结构化配置 JSON/TOML/YAML 走 `setup` hook，Codex#7）；`upstream`（声明上游服务，产出 `{upstreamBase}`）；`setup`/`teardown`（shell 字符串命令；`teardown` 可只依赖 `{project}` 在 repo 根跑）；`start`（长进程命令，只打印不阻塞，worktree-bay 不托管其进程）；`exec`（**argv 数组**，含 `{cmd...}` splice）；`run`（命名命令，**argv 数组**）。新增/调整服务只改这一处。

**配置校验（加载时强制）**：① 各服务 `offset` 互不相同；② `1 ≤ offset < slotSpan`；③ `upstream.service` 必须存在于 `services`；④ 所有模板里引用的 `{var}` 都可解析（基础变量或该服务 `vars` 已声明）；⑤ `repo` 指向的目录存在（Codex#16）。任一不满足直接报错退出。

### 3.2 命令面（统一 CLI）

```
worktree-bay claim <feature>                          # 占槽 → 分配最小空闲 N → 缓存功能名 → 打印端口表
worktree-bay add <feature> <service> <branch> [base]  # <branch>=要创建的功能分支；[base]=基(默认 origin/HEAD)
worktree-bay ls                                       # 对账：每槽 N/功能/各服务 worktree/端口/是否已并入主分支，标记可回收
worktree-bay gc [--apply]                             # 合并感知三档回收（默认 dry-run）
worktree-bay rm <feature> [service] [-f]              # 拆某服务或整槽（删前查脏，§3.5 红线）
worktree-bay run <feature> <service> <name> [args]    # 透传：服务 exec 模板跑 run.<name>，args 以 argv 安全 splice
worktree-bay sh <feature> <service>                   # 进服务运行体 shell（有 TTY 时自动 -it，无则降级，Codex#17）
worktree-bay completion <bash|zsh|fish>               # 打印 shell 补全脚本
```

并发安全：`claim`/`add`/`rm`/`gc` 全程持**工作区原子锁**（`mkdir <ws>/.worktree-bay/lock`，无竞态地"读账本+扫文件系统→提交"，Codex#1），避免两个终端抢同一空槽。
`.worktree-bay-slots.json`（rqapp，gitignore）只存"功能名→N"标签账本；**占用权威来源是文件系统**（§3.5）。`<branch>` 用 `git worktree add -b <branch> <dir> <base>` 新建分支，gc 的合并/未推判定锚定这个明确分支（Codex#2）。

### 3.3 通用步骤引擎（`worktree-bay add` / `rm` / 透传 怎么跑配置）

`worktree-bay add <feature> <service> <branch>` 在**工作区锁内**按序执行（全部对配置做模板插值后运行）：

1. `claim` 槽位（若功能未占）→ 得 `{slot}`/`{port}`/`{slug}`。
2. **端口预检（Codex#11）**：目标 `{port}` 被占用 → 阻断报错（不继续写冲突端口）。
3. `git worktree add -b <branch> <repo>/.worktrees/s<slot>-<slug> <base>`（明确新建分支，槽号烙进目录名）。
4. `copy`：从主 checkout **递归拷贝**列出的文件/目录到 worktree。**若拷的是依赖且检测到 worktree 的 lock（composer.lock 等）与主 checkout 不一致 → 警告并建议改跑安装**（避免拷出版本错位的 vendor，Codex#18）。
5. 算 `{upstreamBase}`：有 `upstream` 且**本槽该上游服务的 worktree 已建（materialized，仅标签/仅 claim 不算）** → 用 `本槽上游端口`（`blockBase + 上游.offset`，不靠运行时探测）；否则用 `upstream.fallback`（Codex#4，堵"指向不存在的本槽 api"）。
6. `env`：对每个 dotenv 文件，把模板化键值**合并**进去（保留其它行，文件不存在则建）。
7. 运行 `setup`（shell 字符串，在 worktree 内，**继承 stdio streaming**——避免 MSYS 输出捕获 bug，无需 `cmd.exe //c`，C4）。
8. 若有 `start`，**打印**命令（长进程交用户自起，worktree-bay 不托管进程）。

`worktree-bay rm`（锁内）：跑 `teardown`（可只依赖 `{project}`）→ 删 worktree（删前查脏/未推，红线见 §3.5）。
透传 `worktree-bay run/sh`：把 `exec` argv 数组里的 `{cmd...}` 用 `run.<name>` 的 argv + 用户 `args` **splice**（不拼字符串，规避空格/引号/管道注入，Codex#8）；stdio streaming，`sh` 在 TTY 下加 `-it`。

### 3.4 模板变量

`setup`/`teardown`/`exec`/`env` 值/`copy`/`vars` 均支持 `{var}` 插值：

| 变量 | 含义 |
|---|---|
| `{slot}` / `{blockBase}` | 槽号 / 块基址（`portBase + slot*slotSpan`） |
| `{port}` | 本服务端口（`blockBase + offset`） |
| `{slug}` | `s<slot>-<分支 slug>`（worktree 目录名）。分支 slug **归一化**：非字母数字折 `-`、去首尾、小写、**截断到安全长度**；归一化后若与同槽已有目录碰撞 → 追加短 hash（Codex#15） |
| `{worktree}` / `{repo}` | worktree 绝对路径 / 服务仓路径 |
| `{upstreamBase}` | 上游服务地址（见 §3.3 步骤 5） |
| `{cmd...}` | 透传内层命令的 **argv splice**（仅 `exec` 数组里用；非字符串插值，Codex#8） |
| 自定义 | `vars` 里声明的（如 `{project}`），可引用上面基础变量 |

### 3.5 自动检测与回收

不引入守护进程；以"**现实即真相**"为原则，靠派生 + 显式清扫做到不泄漏、不误删。

**占用派生（R2 + Codex#1/#5，简单对账不上状态机）**：槽占用真相 = 各服务 `.worktrees/s<N>-*` 是否存在。`.worktree-bay-slots.json` 标签是"已 claim 未 add"窗口的**预约**。`freeSlot = 占用(worktree) ∪ 预约(标签)` 都跳过 → 既不和已起服务撞、也不和刚 claim 的空槽撞。**死槽回收只在 `gc`/`rm`**（不在 `claim`）：`gc` 把"标签在、但该槽 worktree 全无"的视为可清的**空预约**，提示后清（区分不了"刚 claim"还是"已废弃"，故只提示不自动清）。全程在工作区锁内读写，杜绝竞态。

**合并检测（R1，逐仓判定，保守为先）**：判断某服务分支是否已并入主分支——
- **先 `git fetch -q origin`**，拿 `origin/<主分支>` 比（主分支名按仓探测 master/main；合并常发生在远端）。
- **主判据**：`git merge-base --is-ancestor <branch> origin/<主分支>` 成立 → 已合并（覆盖普通 merge / fast-forward）。
- **squash 合并没有可靠的纯 git 判法**（squash 把多 commit 压成新 SHA，`--merged`、patch-id、净 diff 都会漏/误判，尤其主分支后续又前进时两点 diff 会把已合并误判成未合并）。信号退而求其次：**远端分支已被删**（云效 PR squash 合并后通常删源分支），或后续接入 forge API。
- **判不准时一律按"未合并"处理** → 不自动删、只在 `worktree-bay ls` 标记。失败方向永远偏安全（顶多让你手动删，绝不误删）。
- **squash 兜底信号**：`origin/<branch>` 不存在（云效 squash 合并后通常删源分支）→ 在 `gc` 里作为"疑似已合并"**提示**（仍不自动删，需用户确认），缓解槽位泄漏（Codex#10）。
- **整槽已合并** = 该槽**所有**服务分支都判定为已合并。

**"未推/未提交"判据（Codex#3，保守）**：未提交 = `git status --porcelain` 非空；未推 = 该分支存在不在 `origin/<主分支>` 也不在 `origin/<branch>` 的提交。**凡判不出（无 upstream、detached、fetch 失败等）一律视为"有未推"** → 不删。

**三档回收（安全性递增）**：

| 档 | 判据 | 动作 |
|---|---|---|
| 槽号回收 | 该 N 的 worktree 已全不存在 | `freeSlot` 自动跳过空出；残留空标签由 `gc`/`rm` 清 |
| worktree 自动删 | 分支判定已合并 **且** 工作区干净（无未提交 / 无未推 commit） | `worktree-bay gc --apply` 删（**严格先跑 `teardown` 再删 worktree**，从源头不产生孤儿，R5）；否则只在 `worktree-bay ls` 标记、确认后删 |
| 孤儿运行体 | worktree 已被手动删、`setup` 起的容器/进程还在 | `worktree-bay gc` 提示；docker 类可跑 `teardown`（按 `{project}` 在 repo 根，不依赖 worktree）；`start` 手动起的前端进程 worktree-bay 不托管，只**疑似报告**（Codex#9），由用户处理 |

**安全红线**：未合并 或 有未提交/未推改动的 worktree **绝不自动删**，仅在 `worktree-bay ls` 标记，由用户确认后删——避免丢代码。

## 4. 典型流程

```
# 纯后端功能
worktree-bay claim drill-fix                    # → 槽 1, api 在 6011
worktree-bay add drill-fix api feature/drill-fix
worktree-bay run drill-fix api test             # 透传 run.test

# 前后端联调（先 add 上游 api，前端才能按本槽 api 端口自接，R4）
worktree-bay claim enroll-revamp                # → 槽 2
worktree-bay add enroll-revamp api feature/enroll-api
worktree-bay add enroll-revamp lms feature/enroll-ui   # .env.dev.local 自动指向 6021

# 纯前端功能
worktree-bay claim lms-wording                  # → 槽 3
worktree-bay add lms-wording lms feature/wording       # 探测 6031 无 api → 指主栈 6001

# 收尾（任选）
worktree-bay rm drill-fix api                   # 删某服务 worktree，槽随之自动空出
worktree-bay rm enroll-revamp                   # 整槽拆除
worktree-bay gc                                 # 扫已合并/孤儿，自动回收（脏 worktree 只标记）
```

## 5. 实测依据（前端 api base 配置）

| 前端 | 变量 | dev 默认值 |
|---|---|---|
| lms | `VITE_SERVICE_BASE_URL` | `http://localhost:6001` |
| console | `VITE_SERVICE_BASE_URL` | `http://localhost:6001` |
| csp | `VITE_API_BASE_URL` | `http://localhost:6001` |
| h5 | `VITE_API_BASE_URL` | `http://localhost:6001` |
| pc | `VITE_API_BASE_URL` | `https://api.dev.xinranapp.com`（例外） |

**依赖处理：拷或暖装，各服务自选，都不用 `:ro` 共享**——
- **`api` → `copy: ["vendor"]`**：composer 即便暖缓存也要跑 autoload dump + `package:discover`，拷已装好的更省；docker 把 `.:/data/app` 挂进容器，容器内 autoload `$baseDir` 落到 worktree → 成立。
- **前端 → `setup: "pnpm install"`，不拷 `node_modules`（R3）**：pnpm 的 node_modules 是指向全局 store 的符号链接树，拷它既脆弱（保链/Windows junction）又无谓——暖 store 下 `pnpm install` 只重建链接、近乎瞬时。
- 通用 schema 两种都支持，纯配置选择。磁盘成本用户确认可接受。
- **P1 已实测（2026-06-06，本机 Windows NTFS）**：拷 `api/vendor`（238M / 21633 文件）约 **23s**（与暖 composer install 同量级，可接受，方案保留拷 vendor）。**关键修正**：vendor 含符号链接（如 google/flatbuffers），Windows 下原样复制符号链接会失败 → worktree-bay 引擎 `copy` 必须用 `fs.cpSync(..., { dereference: true })` 跟随并拷目标内容（已在实现中修复）。

## 6. 明确不做（YAGNI）

- 不做共享单一 pg/redis 基础设施服务（alpine 容器本就轻，收益不抵复杂度与串库风险）。
- 不做 api 开发库的本地隔离 / 远程分库 / dev 快照——dev 连远程转发共享，约定不在 worktree 乱 `migrate`。
- 不做"一键拉起所有相关仓"（`worktree-bay add` 逐服务显式挂，按需起；自动全开可后续作为糖叠加）。
- 不做 MCP server，直接命令行调。
- 不依赖 worktree-compose：端口是单仓自增 index 无法跨仓协调、前端非 docker 它不接管、回收只有一锅端 `clean`、配置不够通用——与本方案的跨仓槽位 / 声明式通用步骤 / merge 感知回收维度不同，可借鉴思路但不引入依赖。
- 依赖**不共享**（不做 `:ro` 挂载）：各服务自选"拷贝（vendor）或暖装（pnpm install）"，换稳健与通用性（§5）。

## 7. 待定 / 实现期确认

- ~~P1 性能实测~~ **已完成**（见 §5）：拷 vendor ~23s，可接受、保留；并修复符号链接需 `dereference` 的真 bug。
- `start`（长进程）的确切写法（各前端 `pnpm dev --port` 是否需 `--` 透传）——配置里写对即可。
- 端口探测 / 端口占用判断的跨平台实现（仅用于 `ls` 显示是否在跑；upstream 自接已改为按槽登记、不依赖探测）。
- squash 合并检测的增强：是否接入云效 forge API 或"远端分支已删"信号；默认保守按未合并。
- `worktree-bay.config.json` 在 rqapp 的放行（白名单显式放行），`.worktree-bay-slots.json` 保持 gitignore。
- 工具脚手架（package.json / tsconfig / 全局 link）与 `worktree-bay completion` 各 shell 脚本细节。

**故意留作未来（Codex 提出但当前范围 YAGNI）**：`copy` 对象形态（exclude/dereference/overwrite）、`env` 结构化 patch（JSON/TOML/YAML）、`start` 托管进程（managedStart）、多 service 单仓、多 checkout/多用户命名空间（compose project 加 ws 前缀）。当前范围（rqapp + dotenv + 一仓一服务 + 单人本机）不需要；有真实用例再加，逃生口是 `setup`/`teardown` shell hook。
