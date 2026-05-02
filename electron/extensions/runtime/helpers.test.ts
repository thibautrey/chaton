import { describe, expect, it } from 'vitest'
import { stripThinkingBlocks, isValidCronExpression } from './helpers.js'

describe('stripThinkingBlocks', () => {
  it('removes leading think blocks and preserves the user-facing text', () => {
    const text = `<think>
The user asked me not to modify the code yet - they just wanted to know where and how to make the modification. I've provided a comprehensive analysis. Let me wait for their response to see if they want me to proceed with the implementation.
</think>

Let me know if you'd like me to proceed with the implementation, or if you need any clarification on the approach!`

    expect(stripThinkingBlocks(text)).toBe(
      "Let me know if you'd like me to proceed with the implementation, or if you need any clarification on the approach!",
    )
  })

  it('removes multiple thinking block formats and normalizes extra spacing', () => {
    const text = `Before

<thinking type="internal">
step one
</thinking>

Middle

<think>
step two
</think>


After`

    expect(stripThinkingBlocks(text)).toBe('Before\n\nMiddle\n\nAfter')
  })
})

describe('isValidCronExpression', () => {
  it('accepts a simple valid cron expression', () => {
    expect(isValidCronExpression('0 9 * * *')).toBe(true)
  })

  it('accepts wildcard fields', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true)
  })

  it('rejects expressions with too few fields', () => {
    expect(isValidCronExpression('0 9 * *')).toBe(false)
  })

  it('rejects expressions with too many fields', () => {
    expect(isValidCronExpression('0 9 * * * 0')).toBe(false)
  })

  it('rejects minute values out of range', () => {
    expect(isValidCronExpression('60 9 * * *')).toBe(false)
  })

  it('rejects hour values out of range', () => {
    expect(isValidCronExpression('0 24 * * *')).toBe(false)
  })

  it('accepts valid step expressions', () => {
    expect(isValidCronExpression('*/5 * * * *')).toBe(true)
    expect(isValidCronExpression('0 */2 * * *')).toBe(true)
  })

  it('rejects invalid step expressions', () => {
    expect(isValidCronExpression('*/0 * * * *')).toBe(false)
    expect(isValidCronExpression('*/ * * * *')).toBe(false)
  })

  it('accepts valid comma-separated values', () => {
    expect(isValidCronExpression('1,15,30 * * * *')).toBe(true)
    expect(isValidCronExpression('0 9,12,18 * * *')).toBe(true)
  })

  it('accepts valid dash-separated ranges', () => {
    expect(isValidCronExpression('0 9-17 * * *')).toBe(true)
    expect(isValidCronExpression('1-5 * * * *')).toBe(true)
  })

  it('rejects reversed ranges', () => {
    expect(isValidCronExpression('0 30-10 * * *')).toBe(false)
    expect(isValidCronExpression('0 9 30-10 * *')).toBe(false)
  })

  it('rejects out-of-range dash-separated values', () => {
    expect(isValidCronExpression('0 9 32 * *')).toBe(false)
    expect(isValidCronExpression('0 25 * * *')).toBe(false)
  })

  // Bug: "1-3,5" contains both a range and a comma-separated value.
  // Before the fix, includes('-') fired before includes(','), so split('-') produced
  // ['1', '3,5'] — parseInt('3,5') = 3 (stops at comma), falsely passing validation.
  // After the fix, comma is checked first, splitting into ['1-3', '5']; '1-3'
  // is a valid range and '5' is a valid value, so the whole field is valid.
  // This test documents the current (post-fix) behavior: comma takes precedence.
  it('treats comma as list separator first; comma-dash combos are split by comma', () => {
    // '1-3,5' → split by comma → ['1-3', '5'] → both in 0-6 range → true
    expect(isValidCronExpression('0 9 * * 1-3,5')).toBe(true)
    // '1-3,50' → split by comma → ['1-3', '50'] → '50' out of range for DOW → false
    expect(isValidCronExpression('0 9 * * 1-3,50')).toBe(false)
    // '1,3-5' → split by comma → ['1', '3-5'] → both in 0-6 range → true
    expect(isValidCronExpression('0 9 * * 1,3-5')).toBe(true)
    // '1,3-5,7' → split by comma → ['1', '3-5', '7'] → '7' out of range (DOW is 0-6) → false
    expect(isValidCronExpression('0 9 * * 1,3-5,7')).toBe(false)
    // '1-3,5,7' → split by comma → ['1-3', '5', '7'] → '7' out of range (DOW is 0-6) → false
    expect(isValidCronExpression('0 9 * * 1-3,5,7')).toBe(false)
  })
})