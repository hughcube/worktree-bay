import { describe, it, expect } from 'vitest'
import { run, spliceArgv, runShellLive } from '../src/util/exec.js'

describe('exec', () => {
  it('run 返回退出码', () => { expect(run('node', ['-e', 'process.exit(3)']).code).toBe(3) })
  it('runShellLive 非 TTY 透传并返回退出码', async () => {
    expect((await runShellLive('exit 0', {}, 'x')).code).toBe(0)
    expect((await runShellLive('exit 3', {}, 'x')).code).toBe(3)
  })
  it('spliceArgv 把 {cmd...} 替换为 argv（不字符串拼接）', () => { expect(spliceArgv(['docker', 'exec', 'c1', '{cmd...}'], ['php', 'artisan', 'migrate'])).toEqual(['docker', 'exec', 'c1', 'php', 'artisan', 'migrate']) })
})
