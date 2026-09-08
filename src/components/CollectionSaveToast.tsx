type CollectionSaveToastProps = {
  title: string
  detail: string
  onClose: () => void
}

export function CollectionSaveToast({ title, detail, onClose }: CollectionSaveToastProps) {
  return (
    <div className="modal-backdrop mts-toast-backdrop" onClick={onClose} role="presentation">
      <div
        className="mts-toast"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mts-toast-title"
        aria-describedby="mts-toast-detail"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mts-toast__check" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 6 9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="mts-toast__eyebrow">Success</p>
        <h2 id="mts-toast-title">{title}</h2>
        <p id="mts-toast-detail">{detail}</p>
        <button type="button" className="mts-toast__ok" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  )
}
