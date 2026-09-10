import {
  formatCustomerTxPlateDisplay,
  formatLedgerMoney,
  type CustomerTransactionCompany,
  type CustomerTxLedgerLine,
} from '../lib/customerTransaction'
import type { CustomerTxPrintSheetData } from '../lib/customerTxPrint'
import './CustomerTransactionPrintSheet.css'

export type { CustomerTxPrintSheetData }

type CustomerTransactionPrintSheetProps = {
  data: CustomerTxPrintSheetData | null
  active: boolean
  /** Dashed end mark used by Customer Printables (Print all). */
  showNothingFollows?: boolean
  /**
   * `stacked` = default slip (meta above tables).
   * `dsl` = details on the left; product + payables tables on the right (DSL Printables).
   */
  layout?: 'stacked' | 'dsl'
}

function money(value: number) {
  return formatLedgerMoney(value)
}

function formatPrintDate(dateText: string) {
  const match = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(dateText.trim())
  if (!match) return dateText || '—'
  const [, mm, dd, yyyy, hh, min, ss] = match
  const date = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  )
  if (Number.isNaN(date.getTime())) return dateText
  return date.toLocaleString('en-US')
}

function itemDescription(
  line: CustomerTxLedgerLine,
  company: CustomerTransactionCompany,
) {
  const brand = line.brandName.trim()
  const product = line.description.trim()
  // SMC / Magnolia: product name only. Pepsi keeps subcategory - product.
  if (company === 'SMC' || company === 'Magnolia') {
    return product || brand || '—'
  }
  return brand && product ? `${brand} - ${product}` : brand || product || '—'
}

export function CustomerTransactionPrintSheet({
  data,
  active,
  showNothingFollows = false,
  layout = 'stacked',
}: CustomerTransactionPrintSheetProps) {
  if (!data) return null

  const plateDisplay = formatCustomerTxPlateDisplay(data.truckNo, data.plateNo)
  const paymentValue = Number(data.paymentAmount)
  const incentivesValue = Number(data.incentivesAmount)
  const hasPayment = data.paymentAmount.trim() !== '' && Number.isFinite(paymentValue)
  const hasIncentives =
    data.incentivesAmount.trim() !== '' && Number.isFinite(incentivesValue)
  const paid = (hasPayment ? paymentValue : 0) + (hasIncentives ? incentivesValue : 0)
  const balance = paid - data.payablesTotal
  const chequeLabel = data.cashChequeNo.trim() || '—'
  const isDslLayout = layout === 'dsl'

  const metaBlock = (
    <dl className="ctx-print-sheet__meta">
      <div>
        <dt>CUSTOMER:</dt>
        <dd className="is-customer">{data.customerName || '—'}</dd>
      </div>
      <div>
        <dt>PLATE NO.:</dt>
        <dd className="is-meta">{plateDisplay}</dd>
      </div>
      <div>
        <dt>SALES NO.:</dt>
        <dd className="is-meta">{data.salesNo || '—'}</dd>
      </div>
      <div>
        <dt>INVOICE NO.:</dt>
        <dd className="is-meta">{data.invoiceNo || '—'}</dd>
      </div>
      <div>
        <dt>DATE :</dt>
        <dd className="is-meta">{formatPrintDate(data.dateText)}</dd>
      </div>
    </dl>
  )

  const productsTable = (
    <table className="ctx-print-sheet__table">
      <colgroup>
        <col className="col-qty" />
        <col className="col-unit" />
        <col className="col-desc" />
        <col className="col-price" />
        <col className="col-disc" />
        <col className="col-total" />
        <col className="col-amount" />
      </colgroup>
      <thead>
        <tr>
          <th>QTY</th>
          <th>Unit</th>
          <th>Items description</th>
          <th>Price</th>
          <th>Discount</th>
          <th>Total</th>
          <th>Total amount</th>
        </tr>
      </thead>
      <tbody>
        {data.orderLines.map((line) => (
          <tr key={`fg-${line.productId}`}>
            <td className="is-num">{line.qty}</td>
            <td className="is-unit">{line.unit || 'Case'}</td>
            <td className="is-desc">{itemDescription(line, data.company)}</td>
            <td className="is-num">{money(line.price)}</td>
            <td className="is-num">{money(line.discount)}</td>
            <td className="is-num">{money(line.total)}</td>
            <td className="is-num">{money(line.totalAmount)}</td>
          </tr>
        ))}
        <tr className="is-subtotal">
          <td colSpan={6} className="is-label">
            Total:
          </td>
          <td className="is-num is-red">{money(data.ordersTotal)}</td>
        </tr>

        <tr className="is-section">
          <td colSpan={7}>E M P T I E S</td>
        </tr>

        {data.emptiesLines.map((line) => (
          <tr key={`mt-${line.productId}`}>
            <td className="is-num">{line.qty}</td>
            <td className="is-unit">{line.unit || 'Case'}</td>
            <td className="is-desc">- {line.description.trim() || '—'}</td>
            <td className="is-num">{money(line.price)}</td>
            <td className="is-num">{line.discount ? money(line.discount) : ''}</td>
            <td className="is-num">{line.discount ? money(line.total) : ''}</td>
            <td className="is-num">{money(line.totalAmount)}</td>
          </tr>
        ))}
        <tr className="is-subtotal">
          <td colSpan={6} className="is-label">
            Total:
          </td>
          <td className="is-num is-red">{money(data.emptiesTotal)}</td>
        </tr>
      </tbody>
    </table>
  )

  const footerBlock = (
    <div className="ctx-print-sheet__footer">
      <div className="ctx-print-sheet__row">
        <span>TOTAL PAYABLES:</span>
        <strong className="is-blue">{money(data.payablesTotal)}</strong>
      </div>
      <div className="ctx-print-sheet__row">
        <span>{chequeLabel}:</span>
        <strong className="is-green">{money(hasPayment ? paymentValue : 0)}</strong>
      </div>
      <div className="ctx-print-sheet__row">
        <span>INCENTIVES:</span>
        <strong className="is-green">{money(hasIncentives ? incentivesValue : 0)}</strong>
      </div>
      <div className="ctx-print-sheet__row">
        <span>BALANCE:</span>
        <strong className={balance > 0.005 ? 'is-blue' : 'is-red'}>
          {money(Math.abs(balance) < 0.005 ? 0 : Math.abs(balance))}
        </strong>
      </div>
    </div>
  )

  return (
    <div
      className={`ctx-print-sheet${active ? ' is-active' : ''}${
        isDslLayout ? ' ctx-print-sheet--dsl' : ''
      }`}
      aria-hidden={!active}
    >
      <header className="ctx-print-sheet__brand">
        <p className="ctx-print-sheet__org">The CMJ Corporation</p>
        <p className="ctx-print-sheet__branch">CMJ {data.branch}</p>
        <p className="ctx-print-sheet__title">
          {data.company.toUpperCase()} CUSTOMER TRANSACTION
        </p>
      </header>

      {isDslLayout ? (
        <div className="ctx-print-sheet__dsl-body">
          <div className="ctx-print-sheet__dsl-details">{metaBlock}</div>
          <div className="ctx-print-sheet__dsl-tables">
            {productsTable}
            {footerBlock}
          </div>
        </div>
      ) : (
        <>
          {metaBlock}
          {productsTable}
          {footerBlock}
        </>
      )}

      {showNothingFollows ? (
        <div className="ctx-print-sheet__end" aria-hidden="true">
          <span className="ctx-print-sheet__end-line" />
          <span className="ctx-print-sheet__end-label">Nothing follows</span>
          <span className="ctx-print-sheet__end-line" />
        </div>
      ) : null}
    </div>
  )
}
