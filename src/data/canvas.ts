// Thin typed pass-throughs to the canvas IPC surface. The `typeof` annotations pin each
// wrapper to the exact WistApi signature, so a contract change surfaces here at compile time.
const c = () => window.wist.canvas

export const listCanvases: typeof window.wist.canvas.list = () => c().list()
export const getCanvas: typeof window.wist.canvas.get = (id) => c().get(id)
export const createCanvas: typeof window.wist.canvas.create = (name) => c().create(name)
export const updateCanvas: typeof window.wist.canvas.update = (id, patch) => c().update(id, patch)
export const removeCanvas: typeof window.wist.canvas.remove = (id) => c().remove(id)
export const captureCanvas: typeof window.wist.canvas.capture = (rect, format) => c().capture(rect, format)
export const saveCanvasExport: typeof window.wist.canvas.saveExport = (name, bytes) => c().saveExport(name, bytes)
