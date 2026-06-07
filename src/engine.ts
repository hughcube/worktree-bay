import fs from 'node:fs'
import path from 'node:path'
import { BayConfig, Service, renderTemplate } from './config.js'
import { portOf, portInUse } from './ports.js'
import { scanOccupancy } from './slots.js'
import { addWorktree } from './git.js'
import { runShellLive, run, spliceArgv, isTTY } from './util/exec.js'
import { warn, log } from './util/log.js'
import { withProgress } from './util/progress.js'
import { startDetached, recordedFor, pidAlive, setPid, pidOnPort, readLogTail } from './proc.js'
import { t } from './i18n.js'

export function mergeEnvText(text: string, kv: Record<string, string>): string {
  const lines = text.split('\n'); const seen = new Set<string>()
  const out = lines.map((line) => { const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line); if (m && kv[m[1]] !== undefined) { seen.add(m[1]); return `${m[1]}=${kv[m[1]]}` } return line })
  for (const [k, v] of Object.entries(kv)) if (!seen.has(k)) { if (out.length && out[out.length - 1] === '') out.splice(out.length - 1, 0, `${k}=${v}`); else out.push(`${k}=${v}`) }
  return out.join('\n')
}
export function resolveUpstreamBase(cfg: BayConfig, slot: number, up: { service: string; fallback: string }, materialized: boolean): string {
  return materialized ? `http://localhost:${portOf(cfg.services[up.service].port, slot)}` : up.fallback
}
function upstreamMaterialized(cfg: BayConfig, slot: number, service: string): boolean {
  return (scanOccupancy(cfg).get(slot) ?? []).some((o) => o.service === service)
}

export interface AddCtx { cfg: BayConfig; service: string; sp: Service; slot: number; slug: string; dir: string; repo: string; vars: Record<string, string | number> }
export function buildVars(cfg: BayConfig, ctx: Omit<AddCtx, 'vars'>): Record<string, string | number> {
  const base: Record<string, string | number> = { slot: ctx.slot, port: portOf(ctx.sp.port, ctx.slot), slug: ctx.slug, worktree: ctx.dir, repo: ctx.repo }
  if (ctx.sp.upstream) base.upstreamBase = resolveUpstreamBase(cfg, ctx.slot, ctx.sp.upstream, upstreamMaterialized(cfg, ctx.slot, ctx.sp.upstream.service))
  for (const [k, v] of Object.entries(ctx.sp.vars ?? {})) base[k] = renderTemplate(v, base)
  return base
}

export async function bringUp(ctx: AddCtx, base: string, branch: string): Promise<void> {
  const { sp, dir, repo, vars } = ctx
  if (await portInUse(Number(vars.port))) throw new Error(t(`端口 ${vars.port} 已被占用。先停掉占用它的进程，或用 \`worktree-bay gc\`/\`worktree-bay down <功能>\` 释放其它槽后重试。`, `port ${vars.port} is already in use. Stop whatever is using it, or free a slot with \`worktree-bay gc\`/\`worktree-bay down <feature>\`, then retry.`))
  addWorktree(repo, dir, branch, base)
  for (const rel of sp.copy ?? []) {
    // dereference: vendor/node_modules 含符号链接，Windows 下原样复制符号链接会失败，跟随并拷目标内容。
    // 用异步 cp + spinner，让大目录（如 vendor ~238MB）拷贝时不像卡死。
    await withProgress(t(`拷贝 ${rel}`, `copying ${rel}`), () =>
      fs.promises.cp(path.join(repo, rel), path.join(dir, rel), { recursive: true, dereference: true }))
    for (const lock of ['composer.lock', 'pnpm-lock.yaml', 'package-lock.json']) {
      const a = path.join(repo, lock), b = path.join(dir, lock)
      if (fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) warn(t(`⚠ ${lock} 与主 checkout 不一致，拷来的依赖可能版本错位；建议把该服务的 copy 去掉、改用 setup 跑安装命令。`, `⚠ ${lock} differs from the main checkout; copied dependencies may be the wrong version. Consider dropping copy for this service and installing via setup instead.`))
    }
  }
  for (const [file, kv] of Object.entries(sp.env ?? {})) {
    const fp = path.join(dir, file); const cur = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : ''
    const rendered: Record<string, string> = {}; for (const [k, v] of Object.entries(kv)) rendered[k] = renderTemplate(v, vars)
    fs.writeFileSync(fp, mergeEnvText(cur, rendered))
  }
  if (sp.setup) {
    const cmd = renderTemplate(sp.setup, vars)
    const r = await runShellLive(cmd, { cwd: dir }, t(`setup：${cmd}`, `setup: ${cmd}`))
    if (r.code !== 0) throw new Error(t(`setup 命令失败（退出码 ${r.code}）。完整输出见上；修好后可重跑 add（已建的 worktree 会被复用，不会重复创建）。`, `setup command failed (exit code ${r.code}). Full output is above; after fixing, re-run add (the existing worktree is reused, not recreated).`))
  }
}

// 托管启动 dev server（start）：端口已在监听 / 已登记进程存活 → 跳过；否则后台 detach 启动并登记。
// 让 up 可重入（再跑一次只补起没在跑的），并由 down 负责停。
export async function ensureStarted(ctx: AddCtx): Promise<void> {
  const { cfg, sp, dir, service, slug, vars } = ctx
  if (!sp.start) return
  const ws = cfg.workspaceRoot, port = Number(vars.port)
  const rec = recordedFor(ws, dir)
  if (rec && pidAlive(rec.pid)) { log(t(`  • ${service} dev server 已在跑（pid ${rec.pid}，端口 ${port}）`, `  • ${service} dev server already running (pid ${rec.pid}, port ${port})`)); return }
  if (await portInUse(port)) { log(t(`  • 端口 ${port} 已在监听，视为 ${service} dev server 在跑，跳过启动`, `  • port ${port} already listening; treating ${service} dev server as up, skip`)); return }
  const cmd = renderTemplate(sp.start, vars)
  const r = startDetached(ws, dir, service, slug, port, cmd)
  // 等它在【约定端口】上监听（最多 ~25s，给 vite 冷启动 + 偶发 restart 留足时间）。
  // 起来后按端口查出真实 pid 回填（shell/pnpm 会让记录 pid 漂移）。
  const up = await waitForListen(port, 25000)
  if (up) {
    const real = pidOnPort(port); if (real && real > 0) setPid(ws, dir, real)
    log(t(`  ▸ 已后台启动 ${service} dev server（pid ${real || r.pid}，端口 ${port}）  日志: ${r.log}`, `  ▸ started ${service} dev server in background (pid ${real || r.pid}, port ${port})  log: ${r.log}`))
  } else {
    // 超时不等于失败：dev server 可能仍在启动/重启。给中性提示 + 日志末尾，让用户稍后 ls 复查或排查。
    const tail = readLogTail(r.log)
    warn(t(`  • ${service} dev server 已在后台启动，但 25s 内端口 ${port} 还没就绪——可能仍在启动/重启。\n     稍后用 \`worktree-bay ls\` 看是否 ▸run；若起不来，多半是 start 命令不对或端口被占退避（vite 建议加 --strictPort）。\n     命令: ${cmd}    日志: ${r.log}\n     ${tail ? '日志末尾:\n' + tail : ''}`,
           `  • ${service} dev server launched, but port ${port} isn't ready within 25s — it may still be starting/restarting.\n     Check \`worktree-bay ls\` shortly for ▸run; if it never comes up, the start command is likely wrong or it fell back to another port (add --strictPort for vite).\n     command: ${cmd}    log: ${r.log}\n     ${tail ? 'log tail:\n' + tail : ''}`))
  }
}
// 轮询直到约定端口被监听（true），或超时（false）
async function waitForListen(port: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  for (;;) {
    if (await portInUse(port)) return true
    if (Date.now() >= end) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

export function execArgv(ctx: { sp: Service; vars: Record<string, string | number> }, cmd: string[]): string[] {
  const tpl = (ctx.sp.exec ?? ['sh', '-c', '{cmd...}']).map((el) => el === '{cmd...}' ? el : renderTemplate(el, ctx.vars))
  const spliced = spliceArgv(tpl, cmd)
  if (isTTY() && cmd[0] === 'sh' && spliced.includes('exec')) spliced.splice(spliced.indexOf('exec') + 1, 0, '-it')
  return spliced
}
export { run }
