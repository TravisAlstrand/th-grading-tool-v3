import { describe, expect, it } from 'vitest'
import { buildQueryUrl, unreachableMessage } from './client'

/**
 * The message is the whole diagnostic. A blocked origin and a dead network
 * arrive identically, so getting the wording wrong costs someone an hour in
 * the wrong settings page — it did.
 */
describe('unreachableMessage', () => {
  it('says offline only when the device actually is', () => {
    expect(unreachableMessage(true, 'https://example.vercel.app')).toMatch(/offline/)
    expect(unreachableMessage(true, '')).not.toMatch(/CORS/)
  })

  it('points at the CORS list when the device is online', () => {
    const message = unreachableMessage(false, 'https://example.vercel.app')
    expect(message).toMatch(/CORS/)
    expect(message).toMatch(/sanity\.io\/manage/)
    // The origin is the thing you have to paste into that list, so it is named.
    expect(message).toContain('https://example.vercel.app')
    expect(message).not.toMatch(/offline/)
  })

  it('drops the origin phrase rather than printing an empty one', () => {
    expect(unreachableMessage(false, '')).not.toMatch(/from\s|from$/)
  })
})

describe('buildQueryUrl', () => {
  it('JSON-encodes params as Sanity’s $name search params', () => {
    const url = new URL(buildQueryUrl('*[_id == $projectId][0]', { projectId: 'abc' }))
    expect(url.searchParams.get('query')).toBe('*[_id == $projectId][0]')
    expect(url.searchParams.get('$projectId')).toBe('"abc"')
  })
})
