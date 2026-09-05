import {
  formatBoPrintMoney,
  formatBoPrintQty,
  type BoPrintData,
} from '../lib/boPrint'
import './BoPrintSheet.css'

type BoPrintSheetProps = {
  data: BoPrintData
}

export function BoPrintSheet({ data }: BoPrintSheetProps) {
  return (
    <div className="bo-print-sheet">
      <header className="bo-print-sheet__brand">
        <p className="bo-print-sheet__company">The CMJ Corporation</p>
        <p className="bo-print-sheet__branch">CMJ Davao</p>
        <p className="bo-print-sheet__title">{data.title}</p>
      </header>

      <div className="bo-print-sheet__meta">
        <div className="bo-print-sheet__meta-main">
          <p>
            <span>DATE:</span> {data.printDateLabel}
          </p>
          <p>
            <span>PLATE NO.:</span> {data.plateNo}
          </p>
          <p>
            <span>LOAD NO.:</span> {data.loadNo}
          </p>
          <p>
            <span>FROM:</span> {data.from}
          </p>
        </div>
        <div className="bo-print-sheet__meta-side">
          <p>
            <span>DATE UPDATED:</span> {data.dateUpdatedLabel}
          </p>
        </div>
      </div>

      <table className="bo-print-sheet__table">
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
          {data.rows.map((row) => (
            <tr key={`line-${row.id}`}>
              <td className="is-num">
                {row.pallets != null ? formatBoPrintQty(row.pallets) : ''}
              </td>
              <td className="is-num">{formatBoPrintQty(row.cases)}</td>
              <td className="is-sku">{row.sku}</td>
              <td className="is-num">{formatBoPrintMoney(row.price)}</td>
              <td className="is-num">{formatBoPrintMoney(row.amount)}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td />
            <td className="is-num">{formatBoPrintQty(data.totalCases)}</td>
            <td />
            <td className="is-label">Total:</td>
            <td className="is-num is-blue">{formatBoPrintMoney(data.totalAmount)}</td>
          </tr>

          <tr className="is-section">
            <td />
            <td colSpan={4}>DISCOUNTS</td>
          </tr>
          {data.rows.map((row) => (
            <tr key={`disc-${row.id}`}>
              <td />
              <td className="is-num">{formatBoPrintQty(row.cases)}</td>
              <td className="is-sku">{row.sku}</td>
              <td className="is-num">{formatBoPrintMoney(0)}</td>
              <td className="is-num">{formatBoPrintMoney(row.discount)}</td>
            </tr>
          ))}
          <tr className="is-total">
            <td />
            <td className="is-num">{formatBoPrintQty(data.totalCases)}</td>
            <td />
            <td className="is-label">Total:</td>
            <td className="is-num is-red">{formatBoPrintMoney(data.totalDiscount)}</td>
          </tr>
        </tbody>
      </table>

      <p className="bo-print-sheet__payables">
        TOTAL PAYABLES: {formatBoPrintMoney(data.totalPayables)}
      </p>
    </div>
  )
}
