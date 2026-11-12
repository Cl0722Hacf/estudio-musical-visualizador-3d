// Almacén IndexedDB para los samples personalizados (se guardan en el navegador, no en el proyecto)
const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open('studio-samples', 1)
  r.onupgradeneeded = () => { r.result.createObjectStore('s') }
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
})
const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open()
  return new Promise<T>((res, rej) => { const rq = f(db.transaction('s', mode).objectStore('s')); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error) })
}
export interface StoredSample { name: string; buf: ArrayBuffer }
export const idbGet = (k: string) => run<StoredSample | undefined>('readonly', (s) => s.get(k))
export const idbSet = (k: string, v: StoredSample) => run('readwrite', (s) => s.put(v, k))
export const idbDel = (k: string) => run('readwrite', (s) => s.delete(k))
