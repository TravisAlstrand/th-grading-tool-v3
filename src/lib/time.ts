export function ago(timestamp: number, now: number = Date.now()): string {
  const mins = Math.round((now - timestamp) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}
