import { useList } from './useData'
import type { Note } from '../types/models'

const wn = () => window.wist.notes
const wf = () => window.wist.noteFolders

/** Fetchers — for pages that keep a bespoke combined load (e.g. notes + folders together). */
export const listNotes = (filters: { search?: string; tag?: string; projectId?: number } = {}) => wn().list(filters)
export const listNoteFolders = () => wf().list()

/** Live notes list for simple consumers (auto-reloads on any 'notes' change). */
export function useNotes(filters?: { search?: string; tag?: string; projectId?: number }) {
  return useList<Note>(() => wn().list(filters), 'notes', [filters?.search, filters?.tag, filters?.projectId])
}

// note mutations
export const createNote = (data: Partial<Note>) => wn().create(data)
export const updateNote = (id: number, patch: Partial<Note>) => wn().update(id, patch)
export const removeNote = (id: number) => wn().remove(id)

// folder mutations
export const createNoteFolder = (name: string, parentId?: number | null) => wf().create(name, parentId)
export const renameNoteFolder = (id: number, name: string) => wf().rename(id, name)
export const removeNoteFolder = (id: number) => wf().remove(id)
export const reorderNoteFolders = (ids: number[]) => wf().reorder(ids)
