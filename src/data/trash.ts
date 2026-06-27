// Thin typed pass-throughs to the trash (soft-delete) IPC surface.
const w = () => window.wist.trash

export const listTrash = () => w().list()
export const restoreTrash: typeof window.wist.trash.restore = (kind, id) => w().restore(kind, id)
export const purgeTrash: typeof window.wist.trash.purge = (kind, id) => w().purge(kind, id)
export const emptyTrash = () => w().empty()
