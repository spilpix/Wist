import { create } from 'zustand'

/**
 * Browser-style tab previews: a cache of recent page snapshots keyed by pathname
 * (the tab's identity). Layout captures the content area shortly after each
 * navigation settles; TabBar shows the thumbnail in a hover popover.
 */
interface PreviewState {
  previews: Record<string, string> // pathname → data URL
  set: (path: string, dataUrl: string) => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  previews: {},
  set: (path, dataUrl) => set((s) => ({ previews: { ...s.previews, [path]: dataUrl } })),
}))
