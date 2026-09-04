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

/**
 * What to say when `fetch` rejects outright.
 *
 * A dead network and a cross-origin request the browser refused are the same
 * `TypeError` here — the spec deliberately hides which, so the app cannot
 * tell them apart from the rejection alone. `navigator.onLine` is the one
 * signal that separates them.
 *
 * The old wording said "check your connection" in both cases. Verified
 * against the live API: a request carrying an unlisted `Origin` header comes
 * back `403` with no `Access-Control-Allow-Origin`, which the browser turns
 * into exactly this rejection — so a perfectly healthy deployment on a new
 * domain reads as a network fault, and sends you hunting through
 * environment variables instead of the CORS list.
 *
 * Pure, so both branches are testable without unplugging anything.
 */
export function unreachableMessage(offline: boolean, origin: string): string {
  if (offline) return 'Could not reach Sanity — this device appears to be offline.'
  const from = origin ? ` from ${origin}` : ''
  return `Could not reach Sanity. The request${from} was refused before it returned — usually this origin is not on the project's CORS origins list in sanity.io/manage.`
}

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
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const origin = typeof location !== 'undefined' ? location.origin : ''
    throw new SanityError(unreachableMessage(offline, origin), null, { cause })
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
