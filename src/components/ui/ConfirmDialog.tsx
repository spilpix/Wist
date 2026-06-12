import Modal from './Modal'
import { useI18n } from '../../i18n'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  return (
    <Modal title={title} onClose={onCancel} width="max-w-md">
      <p className="mb-6 text-sm leading-relaxed text-zinc-400">{message}</p>
      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className={danger ? 'btn-danger' : 'btn-accent'} onClick={onConfirm}>
          {confirmLabel ?? t('common.confirm')}
        </button>
      </div>
    </Modal>
  )
}
