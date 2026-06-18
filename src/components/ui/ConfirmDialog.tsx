import Modal from './Modal'
import Button from './Button'
import { useI18n } from '../../i18n'

interface Props {
  /** optional gate — when explicitly false, renders nothing (callers may also just conditionally mount it) */
  open?: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open = true, title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  if (!open) return null
  return (
    <Modal title={title} onClose={onCancel} width="max-w-md">
      <p className="mb-6 text-sm leading-relaxed text-zinc-400">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="subtle" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant={danger ? 'danger' : 'accent'} onClick={onConfirm}>
          {confirmLabel ?? t('common.confirm')}
        </Button>
      </div>
    </Modal>
  )
}
