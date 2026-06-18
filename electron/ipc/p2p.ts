import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// P2P hub file sharing — main-process side. The renderer runs the WebRTC mesh
// (Trystero); main only does the filesystem work it isn't allowed to do in the
// sandbox: hashing local files for the manifest, reading bytes to send, and
// writing received bytes to disk. Transfer itself is peer-to-peer in the renderer.

// MVP cap — a whole file is read into memory before a P2P send, so keep it sane.
const MAX_SEND = 512 * 1024 * 1024 // 512 MB

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(filePath)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
    s.on('error', reject)
  })
}

export function registerP2pHandlers() {
  // name + size + content hash for one local file (used to build the share manifest)
  ipcMain.handle('p2p:fileMeta', async (_e, filePath: string) => {
    try {
      const st = await fs.promises.stat(filePath)
      if (!st.isFile()) return null
      return { name: path.basename(filePath), size: st.size, sha256: await hashFile(filePath), path: filePath }
    } catch {
      return null
    }
  })

  // read a local file's bytes to hand to the renderer for a P2P send (size-capped)
  ipcMain.handle('p2p:readFile', async (_e, filePath: string) => {
    const st = await fs.promises.stat(filePath)
    if (st.size > MAX_SEND) throw new Error('FILE_TOO_LARGE')
    const buf = await fs.promises.readFile(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) // ArrayBuffer
  })

  // save an incoming P2P file to disk — ask where, default to Downloads/<name>
  ipcMain.handle('p2p:saveIncoming', async (e, name: string, bytes: ArrayBuffer) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const safe = path.basename(name || 'file')
    const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('downloads'), safe) })
    if (res.canceled || !res.filePath) return null
    await fs.promises.writeFile(res.filePath, Buffer.from(bytes))
    return res.filePath
  })
}
