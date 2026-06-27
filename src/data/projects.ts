import type { Project } from '../types/models'

// The live project LIST is the global useProjectStore (single source of truth, shared with
// the sidebar). These are one-shot fetchers + mutation pass-throughs for combined loads
// (e.g. the knowledge graph) and detail pages. The main process emits `data-changed`, so
// the store + any useList re-sync after a write.
const w = () => window.wist.projects

export const listProjects = () => w().list()
export const getProject = (id: number) => w().get(id)
export const createProject = (data: Partial<Project>) => w().create(data)
export const updateProject = (id: number, patch: Partial<Project>) => w().update(id, patch)
export const removeProject = (id: number) => w().remove(id)
export const reorderProjects = (ids: number[]) => w().reorder(ids)
