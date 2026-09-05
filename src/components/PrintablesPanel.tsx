import './PrintablesPanel.css'

type PrintablesPanelProps = {
  title: string
  description: string
}

export function PrintablesPanel({ title, description }: PrintablesPanelProps) {
  return (
    <section className="printables-panel" aria-label={title}>
      <header className="printables-panel__head">
        <h1>{title}</h1>
      </header>
      <div className="printables-panel__empty">
        <p className="printables-panel__empty-title">{title}</p>
        <p>{description}</p>
      </div>
    </section>
  )
}

