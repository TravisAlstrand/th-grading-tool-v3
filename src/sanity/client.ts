/**
 * One GET against the public read-only dataset. No SDK, no axios.
 *
 * Failures are surfaced as a typed error so the UI can tell "the network is
 * down" apart from "there is nothing here" — the 2024 tool never consumed
 * the error at all and showed its loading skeleton forever.
 */

const PROJECT_ID = import.meta.env.VITE_SANITY_PROJECT_ID ?? 'supw1mz3'
const DATASET = import.meta.env.VITE_SANITY_DATASET ?? 'production'
const API_VERSION = import.meta.env.VITE_SANITY_API_VERSION ?? '2021-10-21'

export const SANITY_ENDPOINT = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}`

export class SanityError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SanityError'
    this.status = status
  }
}

export type QueryParams = Record<string, string | number | boolean>

export function buildQueryUrl(query: string, params: QueryParams = {}): string {
  const search = new URLSearchParams({ query })
  // Sanity takes query parameters as JSON-encoded `$name` search params.
  for (const [key, value] of Object.entries(params)) {
    search.set(`$${key}`, JSON.stringify(value))
  }
  return `${SANITY_ENDPOINT}?${search.toString()}`
}

export async function sanityFetch<T>(
  query: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildQueryUrl(query, params), {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new SanityError(
      'Could not reach Sanity. Check your connection and try again.',
      null,
      { cause },
    )
  }

  if (!response.ok) {
    throw new SanityError(
      `Sanity returned ${response.status} ${response.statusText}.`,
      response.status,
    )
  }

  let body: { result?: T; error?: { description?: string } }
  try {
    body = await response.json()
  } catch (cause) {
    throw new SanityError('Sanity returned a response that was not JSON.', response.status, {
      cause,
    })
  }

  if (body.error) {
    throw new SanityError(body.error.description ?? 'Sanity rejected the query.', response.status)
  }

  return body.result as T
}
