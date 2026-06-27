// Thin typed pass-throughs to the vault (file index) IPC surface — the data/CRUD ops.
// Low-level shell/media/util calls (open-in-folder, media URLs, drag) stay direct in the view.
const w = () => window.wist.vault

export const listVault: typeof window.wist.vault.list = (parentId) => w().list(parentId)
export const browseVault: typeof window.wist.vault.browse = (dir) => w().browse(dir)
export const openVault: typeof window.wist.vault.open = (p) => w().open(p)
export const addVaultPaths: typeof window.wist.vault.addPaths = (paths, parentId) => w().addPaths(paths, parentId)
export const pickAndAddVault: typeof window.wist.vault.pickAndAdd = (parentId) => w().pickAndAdd(parentId)
export const addVaultFolder: typeof window.wist.vault.addFolder = (parentId) => w().addFolder(parentId)
export const createVaultFolder: typeof window.wist.vault.createFolder = (name, parentId) => w().createFolder(name, parentId)
export const renameVault: typeof window.wist.vault.rename = (id, name) => w().rename(id, name)
export const removeVault: typeof window.wist.vault.remove = (id) => w().remove(id)
export const startVaultDrag: typeof window.wist.vault.startDrag = (p) => w().startDrag(p)
