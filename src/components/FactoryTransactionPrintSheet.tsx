import {
  formatPrintMoney,
  formatPrintQty,
  type FactoryTransactionPrintData,
} from '../lib/factoryTransactionPrint'
import './FactoryTransactionPanel.css'

type FactoryTransactionPrintSheetProps = {
  data: FactoryTransactionPrintData
  className?: string
  isLast?: boolean
}

export function FactoryTransactionPrintSheet({
  data,
  className,
  isLast = true,
}: FactoryTransactionPrintSheetProps) {
  const sheetClass = [
    'factory-tx-print-sheet',
    isLast ? 'is-active' : 'factory-tx-print-sheet--followed',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={sheetClass}>
      <header className="factory-tx-print-sheet__brand">
        <p className="factory-tx-print-sheet__company">The CMJ Corporation</p>
        <p className="factory-tx-print-sheet__branch">CMJ Davao</p>
        <p className="factory-tx-print-sheet__title">{data.title} FACTORY TRANSACTION</p>
      </header>

      <div className="factory-tx-print-meta">
        <p>
          <span>DATE:</span> <strong>{data.printDateLabel}</strong>
        </p>
        <p>
          <span>PLATE NO.:</span> <strong>{data.plateNo.trim() || '—'}</strong>
        </p>
        <p>
          <span>LOAD NO.:</span> <strong>{data.loadNo.trim() || '—'}</strong>
        </p>
        <p>
          <span>DRIVER:</span> <strong>{data.driver.trim() || '—'}</strong>
        </p>
        <p>
          <span>HELPER:</span> <strong>{data.helper.trim() || '—'}</strong>
        </p>
      </div>

      <table className="factory-tx-print-table">
        <thead>
          <tr>
            <th>No of pallets</th>
            <th>No of cases</th>
            <th>SKU</th>
            <th>Price/case</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.printRows.fulls.map((row) => (
            <tr key={row.id}>
              <td className="is-num">{formatPrintQty(row.pallets)}</td>
              <td className="is-num">{formatPrintQty(row.cases)}</td>
              <td className="is-sku">{row.sku}</td>
              <td className="is-num">{formatPrintMoney(row.price)}</td>
              <td className="is-num">{formatPrintMoney(row.amount)}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td className="is-num">{formatPrintQty(data.totals.fgPallets)}</td>
            <td className="is-num">{formatPrintQty(data.totals.fgCases)}</td>
            <td />
            <td className="is-label">Total:</td>
            <td className="is-num is-blue">{formatPrintMoney(data.totals.fullsAmount)}</td>
          </tr>

          <tr className="is-section">
            <td colSpan={5}>DISCOUNTS</td>
          </tr>
          {data.printRows.discounts.map((row) => (
            <tr key={row.id}>
              <td />
              <td className="is-num">{formatPrintQty(row.cases)}</td>
              <td className="is-sku">{row.sku}</td>
              <td className="is-num">{formatPrintMoney(row.price)}</td>
              <td className="is-num">{formatPrintMoney(row.amount)}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td />
            <td />
            <td />
            <td className="is-label">Total:</td>
            <td className="is-num is-red">{formatPrintMoney(data.totals.discountFthAmount)}</td>
          </tr>

          <tr className="is-section is-empties-section">
            <td colSpan={5}>EMPTIES</td>
          </tr>
          {data.printRows.empties.map((row) => (
            <tr key={row.id} className="is-empties">
              <td className="is-num">{formatPrintQty(row.pallets)}</td>
              <td className="is-num">{formatPrintQty(row.cases)}</td>
              <td className="is-sku">{row.sku}</td>
              <td className="is-num">{formatPrintMoney(row.price)}</td>
              <td className="is-num">{formatPrintMoney(row.amount)}</td>
            </tr>
          ))}
          <tr className="is-total is-empties-total">
            <td className="is-num">{formatPrintQty(data.totals.mtsPallets)}</td>
            <td className="is-num">{formatPrintQty(data.totals.mtsCases)}</td>
            <td />
            <td className="is-label">Total:</td>
            <td className="is-num">{formatPrintMoney(data.totals.mtsAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="factory-tx-print-footer">
        <div className="factory-tx-print-payable">
          <div className="factory-tx-print-payable__row">
            <span>TOTAL PAYABLE:</span>
            <strong className="is-blue">{formatPrintMoney(data.payableAmount)}</strong>
          </div>
          <div className="factory-tx-print-payable__row">
            <span>NET PAYABLE:</span>
            <strong className="is-blue">{formatPrintMoney(data.payableAmount)}</strong>
          </div>
        </div>

        <p className="factory-tx-print-cheque">
          Cheque#:<strong>{data.chequeNo.trim() || '—'}</strong>
          {', '}Due date:
          <strong>
            {data.chequeDueDate
              ? new Date(`${data.chequeDueDate}T00:00:00`).toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: '2-digit',
                })
              : '—'}
          </strong>
          {', '}Amount:
          <strong>{formatPrintMoney(data.chequeAmountValue)}</strong>
        </p>

        <p className={`factory-tx-print-overbal ${data.overBalTone}`}>
          {data.overBal > 0 ? 'over' : 'bal'} {formatPrintMoney(data.overBal)}
        </p>
      </div>
    </div>
  )
}
