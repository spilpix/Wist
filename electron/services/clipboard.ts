import fs from 'node:fs'
import path from 'node:path'
import { nativeImage, type NativeImage } from 'electron'

export interface ClipboardPayload {
  text?: string
  imagePaths?: string[]
}

/**
 * Build an Electron clipboard write-bundle from a copy payload: plain text + an HTML
 * flavour with the images inlined as base64 <img> tags + the first readable image as a
 * native bitmap (so a paste into an image-aware target gets a real picture). Unreadable
 * files are skipped. Returns null when there is nothing to write.
 *
 * Extracted from the IPC router so the handler stays a thin `handle → service` shim.
 */
export function buildClipboardData(payload: ClipboardPayload): { text?: string; html?: string; image?: NativeImage } | null {
  const text = payload.text ?? ''
  const paths = (payload.imagePaths ?? []).filter(Boolean)
  let bitmap: NativeImage | null = null
  const imgTags: string[] = []
  for (const p of paths) {
    try {
      const ext = path.extname(p).slice(1).toLowerCase() || 'png'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      imgTags.push(
        `<img src="data:image/${mime};base64,${fs.readFileSync(p).toString('base64')}" style="max-width:100%;display:block;margin:8px 0" />`
      )
      if (!bitmap) {
        const ni = nativeImage.createFromPath(p)
        if (!ni.isEmpty()) bitmap = ni
      }
    } catch {
      /* unreadable file — skip */
    }
  }
  const data: { text?: string; html?: string; image?: NativeImage } = {}
  if (text) data.text = text
  if (text || imgTags.length) {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    data.html = `<div style="white-space:pre-wrap;font-family:sans-serif">${esc}</div>${imgTags.join('')}`
  }
  if (bitmap) data.image = bitmap
  if (!data.text && !data.html && !data.image) return null
  return data
}
