import { useList } from './useData'
import type { Task } from '../types/models'

const w = () => window.wist.tasks

/** Live task list — auto-reloads on any 'tasks' change (filters re-fetch on change). */
export function useTasks(filters?: { done?: boolean; projectId?: number }) {
  return useList<Task>(() => w().list(filters), 'tasks', [filters?.done, filters?.projectId])
}

/** One-shot fetcher — for pages that keep a bespoke combined load (e.g. Home). */
export const listTasks = (filters?: { done?: boolean; projectId?: number }) => w().list(filters)

// Mutations — thin pass-throughs. The main process emits `data-changed` after each
// write, so every mounted useTasks() re-fetches on its own; callers needn't reload.
export const createTask = (data: Partial<Task>) => w().create(data)
export const updateTask = (id: number, patch: Partial<Task>) => w().update(id, patch)
export const removeTask = (id: number) => w().remove(id)
export const reorderTasks = (ids: number[]) => w().reorder(ids)
export const clearCompletedTasks = () => w().clearCompleted()
