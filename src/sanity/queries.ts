/**
 * Two queries, not one.
 *
 * The 2024 tool pulled every requirement of every project on every boot —
 * 1,323 requirement documents to render a list of 65 project titles. The
 * index below fetches only what the launcher shows (counts are computed in
 * GROQ, not by transferring the rows), and the detail query fetches one
 * project's rubric when a review actually opens.
 */

export const INDEX_QUERY = `
*[_type == "techdegree"] | order(name asc) {
  _id, name, abbr, color,
  "projects": *[_type == "project" && references(^._id)] | order(projectNumber asc) {
    _id, title, projectNumber,
    "requirementCount": count(*[_type == "requirement" && references(^._id)]),
    "exceedsCount": count(*[_type == "requirement" && references(^._id) && isExceeds == true])
  }
}`

export const PROJECT_QUERY = `
*[_type == "project" && _id == $projectId][0] {
  _id, title, projectNumber, studyGuide,
  mobileMockup, tabletMockup, desktopMockup,
  // The three validators are their own document type and reference nothing,
  // so they are the same list for every project. Co-queried here rather than
  // fetched separately — Sanity answers both in one round trip.
  "resources": *[_type == "resource"] | order(title asc) { _id, title, description, link },
  "techdegree": techdegree->{_id, name, abbr, color},
  "gradingSections": *[_type == "gradingSection" && references(^._id)] | order(order asc) {
    _id, title, order,
    "requirements": *[_type == "requirement" && references(^._id)] | order(order asc) {
      _id, title, description, order,
      "isExceeds": coalesce(isExceeds, false)
    }
  }
}`
