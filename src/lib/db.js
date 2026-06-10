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

export async function get(storeName, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })
}

export async function getAll(storeName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function put(storeName, data) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(data)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function del(storeName, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
