// Shared internal drag-and-drop protocol.
//
// Lets media items — Library titles, music playlists, local tracks, Vault files, Hub
// assets, Canvas images — be dragged BETWEEN the app's sections: onto the Canvas board,
// into a Hub, or (via a spring-loaded workspace tab) across full-page routes.
//
// The payload rides on a private MIME type. Note that during `dragover` the browser only
// exposes `dataTransfer.types` (not the data) for security, so target detection keys off
// the type alone; the full JSON payload is only read on `drop`.

export const WIST_MEDIA_MIME = 'application/x-wist-media'

export type MediaKind = 'image' | 'audio' | 'video' | 'file' | 'url' | 'title' | 'playlist'

export interface MediaDragItem {
  source: string // where the drag began: 'library' | 'music' | 'vault' | 'hub' | 'canvas'
  kind: MediaKind
  title?: string
  path?: string | null // absolute local file (the content — an image / audio file / …)
  url?: string | null // external link (playlists)
  cover?: string | null // a displayable image path (cover art, or the image itself)
  // identity of the source row — lets a drop target add the item to a Library
  // collection by (kind, id). Absent for drags with no backing DB row.
  ref?: { kind: string; id: number } | null
}

type WithTransfer = { dataTransfer: DataTransfer }

const hasType = (e: WithTransfer, type: string): boolean => {
  const types = e.dataTransfer.types
  // `types` is array-like (DOMStringList on some engines) — go through indexOf to be safe
  return Array.prototype.indexOf.call(types, type) !== -1
}

/** Write the media payload onto a `dragstart` event. Also mirrors a plain-text fallback
 *  so dropping the item into a text field / another app degrades gracefully.
 *  Pass `el` (usually `e.currentTarget`) to give the drag the design-system look:
 *  a tilted ghost under the cursor + a dimmed origin. */
export function setMediaDrag(
  e: WithTransfer,
  items: MediaDragItem | MediaDragItem[],
  el?: HTMLElement | null
): void {
  const arr = Array.isArray(items) ? items : [items]
  try {
    e.dataTransfer.setData(WIST_MEDIA_MIME, JSON.stringify(arr))
    const text = arr.map((i) => i.url || i.title || i.path || '').filter(Boolean).join('\n')
    if (text) e.dataTransfer.setData('text/plain', text)
    e.dataTransfer.effectAllowed = 'copyMove'
  } catch {
    /* dataTransfer locked (rare) — nothing to do */
  }
  if (el) liftDragSource(e, el)
}

/** Design-system drag look: a tilted ghost follows the cursor (`.drag-ghost` →
 *  rotate 2.5°) and the source element dims (`.drag-dim`) until the drag ends. */
export function liftDragSource(e: WithTransfer, el: HTMLElement): void {
  try {
    const dt = e.dataTransfer as DataTransfer & { setDragImage?: (img: Element, x: number, y: number) => void }
    if (typeof dt.setDragImage === 'function') {
      const rect = el.getBoundingClientRect()
      const ghost = el.cloneNode(true) as HTMLElement
      Object.assign(ghost.style, {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        pointerEvents: 'none',
      })
      ghost.classList.add('drag-ghost')
      document.body.appendChild(ghost)
      // grab near the cursor's spot in the element so the tilt pivots naturally
      dt.setDragImage(ghost, Math.min(rect.width / 2, 140), Math.min(rect.height / 2, 30))
      // the browser snapshots the image synchronously — safe to drop the node next tick
      setTimeout(() => ghost.remove(), 0)
    }
  } catch {
    /* setDragImage unsupported — the native drag image is a fine fallback */
  }
  el.classList.add('drag-dim')
  el.addEventListener('dragend', () => el.classList.remove('drag-dim'), { once: true })
}

/** Read the media payload on `drop`. Returns null when the drag carried no Wist media. */
export function readMediaDrag(e: WithTransfer): MediaDragItem[] | null {
  try {
    const raw = e.dataTransfer.getData(WIST_MEDIA_MIME)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? (parsed as MediaDragItem[]) : null
  } catch {
    return null
  }
}

/** True while dragging an internal Wist media item (payload present). */
export function dragHasMedia(e: WithTransfer): boolean {
  return hasType(e, WIST_MEDIA_MIME)
}

/** True for an internal media drag OR a real OS file drag — both are droppable onto the
 *  Canvas / a Hub, and both should arm spring-loaded navigation. */
export function dragHasDroppable(e: WithTransfer): boolean {
  return hasType(e, WIST_MEDIA_MIME) || hasType(e, 'Files')
}

/** True ONLY for a genuine drag of files from the OS (Explorer, desktop, another app).
 *  Excludes internal Wist drags — so an import drop-zone never lights up when you're just
 *  dragging a row around inside the app. This is THE rule a file-import zone keys off. */
export function isExternalFileDrag(e: WithTransfer): boolean {
  return hasType(e, 'Files') && !hasType(e, WIST_MEDIA_MIME)
}

/** Last path segment of a file path or URL — a friendly fallback label. */
export function baseName(p: string): string {
  const seg = p.split(/[\\/]/).pop() || p
  return seg.split('?')[0] || p
}

/** Whether a path points at a renderable raster/vector image. */
export function isImagePath(p: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(p)
}
