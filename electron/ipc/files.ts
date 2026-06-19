import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { coversDir } from '../settings'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

function win(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows()[0]
}

export async function pickFolder(): Promise<string | null> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Choose folder',
    properties: ['openDirectory'],
  })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
}

export async function pickImage(): Promise<string | null> {
  const res = await dialog.showOpenDialog(win()!, {
    title: 'Choose cover image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  })
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0]
}

export async function saveCoverFromPath(srcPath: string): Promise<string> {
  const ext = path.extname(srcPath).slice(1).toLowerCase() || 'jpg'
  const dest = path.join(coversDir(), `cover-${crypto.randomBytes(8).toString('hex')}.${ext}`)
  fs.copyFileSync(srcPath, dest)
  return dest
}

export async function saveCoverFromBytes(name: string, bytes: ArrayBuffer): Promise<string> {
  const ext = path.extname(name).slice(1).toLowerCase() || 'jpg'
  const dest = path.join(coversDir(), `cover-${crypto.randomBytes(8).toString('hex')}.${ext}`)
  fs.writeFileSync(dest, Buffer.from(bytes))
  return dest
}
