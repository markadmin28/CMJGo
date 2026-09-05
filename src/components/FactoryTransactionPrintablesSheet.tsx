import {
  formatPrintMoney,
  formatPrintPalletsBreakdown,
  formatPrintQty,
  formatPrintRunningQty,
  type FactoryTransactionPrintData,
} from '../lib/factoryTransactionPrint'
import './FactoryTransactionPanel.css'
import './FtPrintablesPanel.css'

type FactoryTransactionPrintablesSheetProps = {
  data: FactoryTransactionPrintData
  className?: string
  isLast?: boolean
}

export function FactoryTransactionPrintablesSheet({
  data,
  className,
  isLast = true,
}: FactoryTransactionPrintablesSheetProps) {
  const otherDeductionsTotal = data.otherDeductions.reduce((sum, entry) => sum + entry.amount, 0)
  const deductionsTotal =
    data.totals.discountFthAmount + data.totals.mtsAmount + otherDeductionsTotal
  const sheetClass = [
    'factory-tx-print-sheet',
    'factory-tx-print-sheet--printables',
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

      <div className="factory-tx-printables-layout">
        <div className="factory-tx-print-meta factory-tx-print-meta--printables">
          <p>
            <span>DATE:</span> <strong>{data.printDateLabel}</strong>
          </p>
          <p>
            <span>UPDATED:</span> <strong>{data.updatedLabel}</strong>
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

        <div className="factory-tx-printables-content">
      <table className="factory-tx-print-table">
        <colgroup>
          <col className="factory-tx-print-col--pallets" />
          <col className="factory-tx-print-col--cases" />
          <col className="factory-tx-print-col--sku" />
          <col className="factory-tx-print-col--price" />
          <col className="factory-tx-print-col--amount" />
        </colgroup>
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
              <td className="is-num">{formatPrintPalletsBreakdown(row.pallets, row.cases)}</td>
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
              <td className="is-num">{formatPrintPalletsBreakdown(row.pallets, row.cases)}</td>
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

      <table className="factory-tx-print-table factory-tx-printables-summary-table">
        <colgroup>
          <col className="factory-tx-print-col--pallets" />
          <col className="factory-tx-print-col--cases" />
          <col className="factory-tx-print-col--sku" />
          <col className="factory-tx-print-col--price" />
          <col className="factory-tx-print-col--amount" />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} />
            <td className="is-label is-blue">Fulls Amount:</td>
            <td className="is-num is-blue is-summary-value">{formatPrintMoney(data.totals.fullsAmount)}</td>
            <td />
          </tr>
          <tr>
            <td colSpan={2} className="is-label is-red">Total Discount:</td>
            <td className="is-num is-red is-summary-value">{formatPrintMoney(data.totals.discountFthAmount)}</td>
            <td colSpan={2} />
          </tr>
          <tr>
            <td colSpan={2} className="is-label is-red">Total Empties Amount:</td>
            <td className="is-num is-red is-summary-value">{formatPrintMoney(data.totals.mtsAmount)}</td>
            <td colSpan={2} />
          </tr>
          {data.otherDeductions.map((entry) => (
            <tr key={entry.id}>
              <td colSpan={2} className="is-label is-red">{entry.description}</td>
              <td className="is-num is-red is-summary-value">{formatPrintMoney(entry.amount)}</td>
              <td colSpan={2} />
            </tr>
          ))}
          <tr className="is-summary-total-line">
            <td colSpan={2} />
            <td className="is-num is-red is-summary-value">{formatPrintMoney(deductionsTotal)}</td>
            <td colSpan={2} />
          </tr>
          {data.otherAdditionals.map((entry) => (
            <tr key={entry.id}>
              <td colSpan={2} />
              <td className="is-label is-blue">{entry.description}</td>
              <td className="is-num is-blue is-summary-value">{formatPrintMoney(entry.amount)}</td>
              <td />
            </tr>
          ))}
          <tr className="is-summary-net-line">
            <td colSpan={3} />
            <td className="is-num is-blue is-summary-value">{formatPrintMoney(data.payableAmount)}</td>
            <td />
          </tr>
          <tr className="is-summary-net">
            <td colSpan={2} />
            <td className="is-label is-blue">NET PAYABLE:</td>
            <td className="is-num is-blue is-summary-value">{formatPrintMoney(data.payableAmount)}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <p className="factory-tx-print-cheque factory-tx-print-cheque--printables">
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

      <p className={`factory-tx-print-overbal factory-tx-print-overbal--printables ${data.overBalTone}`}>
        {data.overBal > 0 ? 'over' : 'bal'} {formatPrintMoney(data.overBal)}
      </p>

        </div>
      </div>

      <table className="factory-tx-printables-running">
        <thead>
          <tr>
            <th>Total # of pallets in</th>
            <th>Total # of cases in</th>
            <th>Running discount</th>
            <th>Total # of pallets out</th>
            <th>Total # of mts out</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{formatPrintRunningQty(data.runningTotals.palletsIn)}</td>
            <td>{formatPrintRunningQty(data.runningTotals.casesIn)}</td>
            <td>{formatPrintMoney(data.runningTotals.runningDiscount)}</td>
            <td>{formatPrintRunningQty(data.runningTotals.palletsOut)}</td>
            <td>{formatPrintRunningQty(data.runningTotals.mtsOut)}</td>
          </tr>
        </tbody>
      </table>

      <div className="factory-tx-print-sheet__end" aria-hidden="true">
        <span className="factory-tx-print-sheet__end-line" />
        <span className="factory-tx-print-sheet__end-label">Nothing follows</span>
        <span className="factory-tx-print-sheet__end-line" />
      </div>
    </div>
  )
}
