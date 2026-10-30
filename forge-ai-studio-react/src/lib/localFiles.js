// ============================================================================
// Browser-only file + folder storage for Studio.
// No backend and no database: files are saved straight to the user's device
// via the File System Access API, with a download fallback, and project state
// is persisted in IndexedDB (falling back to localStorage) so work survives a
// refresh without any server.
// ============================================================================

const DB_NAME = 'vux-studio'
const DB_VERSION = 1
const STORE = 'projects'
const LS_KEY = 'vux-studio-projects'

export function supportsDeviceSave() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

export function supportsFolderAccess() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

function downloadBlob(fileName, content, mimeType = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save a single file to the user's device. Uses the native Save As picker when
 * available, otherwise falls back to a normal download.
 * @returns {Promise<{method:'device'|'download'|'cancelled', fileName?:string}>}
 */
export async function saveTextToDevice(fileName, content, mimeType = 'text/plain') {
  if (supportsDeviceSave()) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: fileName })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return { method: 'device', fileName: handle.name || fileName }
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'cancelled' }
      // Any other picker failure falls through to a plain download.
    }
  }
  downloadBlob(fileName, content, mimeType)
  return { method: 'download', fileName }
}

const TEXT_EXTENSIONS = /\.(html?|css|scss|jsx?|tsx?|py|json|md|txt|xml|svg|ya?ml|java|c|cpp|cs|go|rb|php|rs|sh)$/i
const MAX_FILE_BYTES = 512 * 1024

/**
 * Import a folder from the user's device into the editor as a flat file map
 * keyed by relative path. Nested folders are flattened with "/" separators.
 */
export async function importProjectFromFolder() {
  if (!supportsFolderAccess()) throw new Error('Folder access is not supported in this browser.')
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
  const files = {}

  const walk = async (handle, prefix) => {
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        if (entry.name.startsWith('.')) continue
        await walk(entry, `${prefix}${entry.name}/`)
      } else if (entry.kind === 'file') {
        if (!TEXT_EXTENSIONS.test(entry.name)) continue
        const file = await entry.getFile()
        if (file.size > MAX_FILE_BYTES) continue
        files[`${prefix}${entry.name}`] = await file.text()
      }
    }
  }

  await walk(dirHandle, '')
  return { name: dirHandle.name || 'Imported folder', files }
}

/**
 * Write every project file into a folder the user selects, recreating nested
 * folders where the file path contains "/".
 */
export async function exportFilesToFolder(files, folderName = 'vux-project') {
  if (!supportsFolderAccess()) throw new Error('Folder access is not supported in this browser.')
  const root = await window.showDirectoryPicker({ mode: 'readwrite' })

  for (const [path, content] of Object.entries(files)) {
    const parts = String(path).split('/').filter(Boolean)
    const fileName = parts.pop() || folderName
    let dir = root
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true })
    }
    const fileHandle = await dir.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(typeof content === 'string' ? content : String(content ?? ''))
    await writable.close()
  }

  return root.name || folderName
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open the local store.'))
  })
}

function readLocalStorageProjects() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocalStorageProjects(projects) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects.slice(0, 10)))
  } catch {
    // Storage may be full or blocked — ignore, IndexedDB is the primary store.
  }
}

/**
 * Persist a project's files in the browser (IndexedDB, with localStorage
 * fallback). No network, no server database.
 */
export async function saveProjectToBrowser(name, files) {
  const record = { id: 'current', name: name || 'Untitled project', files, updatedAt: Date.now() }
  try {
    const db = await openDatabase()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close?.()
  } catch {
    writeLocalStorageProjects([record])
  }
  return record
}

/**
 * Load all projects previously stored in this browser. Returns an array ordered
 * most-recent first. Falls back to localStorage when IndexedDB is unavailable.
 */
export async function loadProjectsFromBrowser() {
  try {
    const db = await openDatabase()
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
    db.close?.()
    if (records.length) {
      return records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    }
  } catch {
    // fall through to localStorage
  }
  return readLocalStorageProjects().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}
