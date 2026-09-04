/**
 * Links that are the same on every review and are not in Sanity.
 *
 * Sanity already owns the two link sources that vary: `studyGuide` on the
 * project, and the `resource` documents (the three validators). Anything a
 * reviewer opens on every review but nobody wants to author in the CMS goes
 * here — edit the array and rebuild.
 *
 * The resources panel renders this group only when it has entries, so an
 * empty list simply means the panel shows one group fewer.
 */
export type PinnedLink = {
  title: string
  description?: string
  href: string
}

export const PINNED_LINKS: PinnedLink[] = []
