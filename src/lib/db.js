const DB_NAME = 'ai_gf'
const REQUIRED_STORES = ['messages', 'images', 'settings']

function openDb(retries = 3) {
  return new Promise((resolve, reject) => {
    let version = 1
    const tryOpen = () => {
      const request = indexedDB.open(DB_NAME, version)
      request.onupgradeneeded = (e) => {
        const db = e.target.result
        for (const name of REQUIRED_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' })
          }
        }
      }
      request.onsuccess = (e) => {
        const db = e.target.result
        const missing = REQUIRED_STORES.filter(s => !db.objectStoreNames.contains(s))
        if (missing.length > 0 && retries > 0) {
          /* stale database: stores missing at current version → bump version to force upgrade */
          db.close()
          version = e.target.result.version + 1
          tryOpen()
          return
        }
        resolve(db)
      }
      request.onerror = (e) => reject(e.target.error)
    }
    tryOpen()
  })
}

async function withDb(storeName, mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    let settled = false
    const done = (err, val) => {
      if (settled) return
      settled = true
      db.close()
      if (err) reject(err)
      else resolve(val)
    }
    tx.onerror = (e) => done(e.target.error)
    tx.onabort = (e) => done(new Error('transaction aborted'))
    tx.oncomplete = () => { if (!settled) done(null, undefined) }
    try { fn(store, done) } catch (e) { done(e) }
  })
}

export async function get(storeName, key) {
  return withDb(storeName, 'readonly', (store, done) => {
    const req = store.get(key)
    req.onsuccess = () => done(null, req.result ?? null)
    req.onerror = () => done(req.error)
  })
}

export async function getAll(storeName) {
  return withDb(storeName, 'readonly', (store, done) => {
    const req = store.getAll()
    req.onsuccess = () => done(null, req.result)
    req.onerror = () => done(req.error)
  })
}

export async function put(storeName, data) {
  return withDb(storeName, 'readwrite', (store, done) => {
    const req = store.put(data)
    req.onsuccess = () => done(null)
    req.onerror = () => done(req.error)
  })
}

export async function del(storeName, key) {
  return withDb(storeName, 'readwrite', (store, done) => {
    const req = store.delete(key)
    req.onsuccess = () => done(null)
    req.onerror = () => done(req.error)
  })
}
