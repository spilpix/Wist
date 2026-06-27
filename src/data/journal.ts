// Thin typed pass-throughs to the journal (daily notes) IPC surface.
const w = () => window.wist.journal

export const getJournal: typeof window.wist.journal.get = (day) => w().get(day)
export const rangeJournal: typeof window.wist.journal.range = (from, to) => w().range(from, to)
export const saveJournal: typeof window.wist.journal.save = (day, patch) => w().save(day, patch)
