import { readFileSync } from 'node:fs'

// 读取随包发布的 skill.md（位于包根，dist 的上一级）
export function readSkill(): string {
  return readFileSync(new URL('../skill.md', import.meta.url), 'utf8')
}
