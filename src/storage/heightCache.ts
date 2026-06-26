import { openDB, type IDBPDatabase } from 'idb'
import type { ViewportBucket } from '../types'

const DB_NAME = 'virtual-search'
const DB_VERSION = 1
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface HeightRecord {
  key: string // itemId:bucket:fontHash
  height: number
  measuredAt: number
}

// One DB instance per store name so each store's upgrade callback fires correctly.
const dbCache = new Map<string, IDBPDatabase>()

async function getDB(storeName: string): Promise<IDBPDatabase> {
  const cached = dbCache.get(storeName)
  if (cached) return cached
  const instance = await openDB(`${DB_NAME}:${storeName}`, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'key' })
        store.createIndex('measuredAt', 'measuredAt')
      }
    },
  })
  dbCache.set(storeName, instance)
  return instance
}

export function buildCacheKey(
  itemId: string,
  bucket: ViewportBucket,
  fontHash: string
): string {
  return `${itemId}:${bucket}:${fontHash}`
}

export async function bulkGetHeights(
  itemIds: string[],
  bucket: ViewportBucket,
  fontHash: string,
  storeName: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  try {
    const database = await getDB(storeName)
    const tx = database.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const now = Date.now()

    await Promise.all(
      itemIds.map(async (id) => {
        const key = buildCacheKey(id, bucket, fontHash)
        const record = await store.get(key) as HeightRecord | undefined
        if (record && now - record.measuredAt < TTL_MS) {
          result.set(id, record.height)
        }
      })
    )
    await tx.done
  } catch {
    // IndexedDB unavailable (private browsing, quota exceeded) — silently degrade
  }
  return result
}

export async function setHeight(
  itemId: string,
  height: number,
  bucket: ViewportBucket,
  fontHash: string,
  storeName: string
): Promise<void> {
  try {
    const database = await getDB(storeName)
    const key = buildCacheKey(itemId, bucket, fontHash)
    await database.put(storeName, {
      key,
      height,
      measuredAt: Date.now(),
    } satisfies HeightRecord)
  } catch {
    // Silently degrade
  }
}

export async function evictStaleEntries(storeName: string): Promise<void> {
  try {
    const database = await getDB(storeName)
    const cutoff = Date.now() - TTL_MS
    const tx = database.transaction(storeName, 'readwrite')
    const index = tx.objectStore(storeName).index('measuredAt')
    const staleKeys = await index.getAllKeys(IDBKeyRange.upperBound(cutoff))
    await Promise.all(staleKeys.map((k) => tx.objectStore(storeName).delete(k)))
    await tx.done
  } catch {
    // Silently degrade
  }
}
