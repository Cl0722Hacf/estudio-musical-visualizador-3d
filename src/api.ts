import { normalize, type Project } from './model'
export type Rhythm = Project & { id: string; source: 'factory' | 'user' }
async function parse<T>(r: Response): Promise<T> {
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((d as { error?: string }).error || 'Error ' + r.status)
  return d as T
}
const toR = (x: Rhythm): Rhythm => ({ ...normalize(x), id: x.id, source: x.source })
export const api = {
  list: () => fetch('/api/rhythms').then((r) => parse<{ rhythms: Rhythm[] }>(r)).then((d) => d.rhythms.map(toR)),
  save: (p: Project) => fetch('/api/rhythms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then((r) => parse<{ rhythm: Rhythm }>(r)).then((d) => toR(d.rhythm)),
  remove: (id: string) => fetch('/api/rhythms/' + encodeURIComponent(id), { method: 'DELETE' }).then((r) => parse<{ ok: boolean }>(r)),
}
