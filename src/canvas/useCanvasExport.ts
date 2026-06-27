import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { CanvasNode } from '../types/models'
import type { Box } from './geometry'
import { captureCanvas, saveCanvasExport } from '../data/canvas'
import { buildPdf } from './pdf'
import { toast } from '../store/toastStore'
import { useI18n } from '../i18n'

type TFn = ReturnType<typeof useI18n>['t']

/**
 * Board export (PNG of the board/a frame, multi-page PDF of all frames) — extracted from
 * CanvasBoard's body. It owns its own menu/exporting flags and the capture/settle helpers;
 * the board passes in the pieces it needs (the frame list, selection setters, camera fit
 * helpers). Each export clears the selection + parks the camera on a settled frame, captures
 * via the main process, and writes the file.
 */
export function useCanvasExport(opts: {
  boardRef: MutableRefObject<HTMLDivElement | null>
  name: string
  frames: CanvasNode[]
  selRef: MutableRefObject<Set<string>>
  setSel: Dispatch<SetStateAction<Set<string>>>
  setSelEdge: Dispatch<SetStateAction<string | null>>
  setOpenComment: Dispatch<SetStateAction<string | null>>
  fit: (animate?: boolean) => void
  fitBox: (box: Box, margin?: number) => void
  t: TFn
}) {
  const { boardRef, name, frames, selRef, setSel, setSelEdge, setOpenComment, fit, fitBox, t } = opts
  const [exportMenu, setExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)

  // wait two frames + a beat so the camera tween/layout has settled before capture
  const settle = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 140))))
  const captureRect = () => {
    const r = boardRef.current!.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  }

  const exportPng = async (scope: 'board' | 'frame') => {
    setExportMenu(false)
    const selFrame = frames.find((n) => selRef.current.has(n.id))
    const target = scope === 'frame' ? selFrame ?? frames[0] : undefined
    setSel(new Set())
    setSelEdge(null)
    setOpenComment(null)
    setExporting(true)
    if (target) fitBox(target, 8)
    else fit()
    await settle()
    const cap = await captureCanvas(captureRect(), 'png').catch(() => null)
    setExporting(false)
    if (cap) {
      const saved = await saveCanvasExport(`${name || 'board'}.png`, cap.bytes)
      if (saved) toast(t('canvas.exported'), 'success')
    }
  }

  const exportPdf = async () => {
    setExportMenu(false)
    if (!frames.length) {
      toast(t('canvas.noFrames'), 'error')
      return
    }
    setSel(new Set())
    setSelEdge(null)
    setOpenComment(null)
    setExporting(true)
    const pages: { bytes: Uint8Array; width: number; height: number }[] = []
    for (let i = 0; i < frames.length; i++) {
      fitBox(frames[i], 8)
      await settle()
      const cap = await captureCanvas(captureRect(), 'jpeg').catch(() => null)
      if (cap) pages.push({ bytes: cap.bytes, width: cap.width, height: cap.height })
    }
    setExporting(false)
    if (pages.length) {
      const pdf = buildPdf(pages)
      const saved = await saveCanvasExport(`${name || 'board'}.pdf`, pdf)
      if (saved) toast(t('canvas.exported'), 'success')
    }
  }

  return { exportMenu, setExportMenu, exporting, exportPng, exportPdf }
}
