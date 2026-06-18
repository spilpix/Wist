import { Notification } from 'electron'
import { dueReminders, markReminded } from './db/tasks'

/**
 * Background task-reminder scheduler. Every 30s it looks for tasks whose remind_at
 * has passed and that haven't been notified yet, shows a native OS notification, and
 * marks them reminded so they fire exactly once. Clicking a notification calls onClick.
 *
 * Caps notifications at 5 per tick (e.g. after the app was closed for a long time)
 * but still marks all due ones reminded, so a backlog can't flood the user repeatedly.
 */
export function startReminders(onClick: (taskId: number) => void): NodeJS.Timeout {
  const tick = () => {
    let due
    try {
      due = dueReminders()
    } catch (err) {
      console.error('reminder scan failed', err)
      return
    }
    if (!due.length) return
    // can't notify right now → leave reminded=0 so they retry on a later tick / next launch
    if (!Notification.isSupported()) return
    // notify at most 5 per tick AND mark ONLY the ones we actually showed — the rest keep
    // reminded=0 and trickle out 5-at-a-time next ticks (never silently dropped)
    for (const task of due.slice(0, 5)) {
      try {
        const n = new Notification({
          title: task.title || 'Bard',
          body: (task.note && task.note.trim()) || (task.project_name ? `· ${task.project_name}` : 'Напоминание о задаче'),
          silent: false,
        })
        n.on('click', () => onClick(task.id))
        n.show()
        markReminded(task.id)
      } catch (err) {
        console.error('show notification failed', err)
      }
    }
  }

  const timer = setInterval(tick, 30_000)
  // a short initial delay so the window is up before any backlog fires
  setTimeout(tick, 4_000)
  return timer
}
