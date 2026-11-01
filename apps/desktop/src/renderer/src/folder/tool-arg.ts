/**
 * The most telling argument of a call: the query, the id, the url… In a page, what Marianne said a
 * click was for, or what she typed, rather than the element's id (« e37 »), which tells the user nothing.
 */
export function toolArg(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  for (const key of ['purpose', 'query', 'url', 'id', 'name', 'number', 'address', 'commune', 'kind', 'domain', 'label', 'value']) {
    if (typeof o[key] === 'string' || typeof o[key] === 'number') return String(o[key])
  }
  const first = Object.values(o).find((v) => typeof v === 'string')
  return typeof first === 'string' ? first : ''
}
