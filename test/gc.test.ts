import { describe, it, expect } from 'vitest'
import { classifyForGc } from '../src/commands/gc.js'

describe('gc classify', () => {
  it('已合并+干净=auto-remove', () => expect(classifyForGc({ merged: true, dirty: false, unpushed: false })).toBe('auto-remove'))
  it('已合并+脏=flag', () => expect(classifyForGc({ merged: true, dirty: true, unpushed: false })).toBe('flag'))
  it('未合并=keep', () => expect(classifyForGc({ merged: false, dirty: false, unpushed: false })).toBe('keep'))
  it('已合并但未推=flag', () => expect(classifyForGc({ merged: true, dirty: false, unpushed: true })).toBe('flag'))
})
