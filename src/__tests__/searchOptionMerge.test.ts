import { describe, expect, it } from 'vitest'
import { mergeSearchOptions } from '../search/miniSearchAdapter'

describe('mergeSearchOptions', () => {
  it('preserves independent options across repeated updates', () => {
    let options = mergeSearchOptions({}, { exactMatch: true })
    options = mergeSearchOptions(options, { wholeWord: true })
    options = mergeSearchOptions(options, { caseSensitive: true })
    expect(options).toEqual({ exactMatch: true, wholeWord: true, caseSensitive: true })
  })

  it('keeps regex and exact-match mutually exclusive in core', () => {
    const regex = mergeSearchOptions({ exactMatch: true }, { regex: true })
    expect(regex).toEqual({ exactMatch: false, regex: true })

    const exact = mergeSearchOptions(regex, { exactMatch: true })
    expect(exact).toEqual({ exactMatch: true, regex: false })
  })
})
