import { useEffect, useState } from 'react'
import type { UserBranch } from '../lib/branches'
import {
  customerLedgerTitle,
  formatCustomerTxPlateDisplay,
  formatLedgerMoney,
  type CustomerTransactionCompany,
  type CustomerTxLedgerLine,
} from '../lib/customerTransaction'
import './CustomerLedgerModal.css'

export type CustomerLedgerModalProps = {
  open: boolean
  company: CustomerTransactionCompany
  branch: UserBranch
  customerName: string
  salesNo: string
  invoiceNo: string
  truckNo: string
  plateNo: string
  dateText: string
  orderLines: CustomerTxLedgerLine[]
  emptiesLines: CustomerTxLedgerLine[]
  ordersTotal: number
  emptiesTotal: number
  payablesTotal: number
  saving?: boolean
  error?: string | null
  initialPaymentAmount?: string
  initialCashChequeNo?: string
  saveLabel?: string
  onClose: () => void
  onSave: (payment: { amount: string; cashChequeNo: string }) => void
}

function moneyCell(value: number) {
  return formatLedgerMoney(value)
}

export function CustomerLedgerModal({
  open,
  company,
  branch,
  customerName,
  salesNo,
  invoiceNo,
  truckNo,
  plateNo,
  dateText,
  orderLines,
  emptiesLines,
  ordersTotal,
  emptiesTotal,
  payablesTotal,
  saving = false,
  error = null,
  initialPaymentAmount = '',
  initialCashChequeNo = '',
  saveLabel = 'Save',
  onClose,
  onSave,
}: CustomerLedgerModalProps) {
  const [paymentAmount, setPaymentAmount] = useState('')
  const [cashChequeNo, setCashChequeNo] = useState('')

  useEffect(() => {
    if (!open) return
    setPaymentAmount(initialPaymentAmount)
    setCashChequeNo(initialCashChequeNo)
  }, [open, initialPaymentAmount, initialCashChequeNo])

  if (!open) return null

  const plateDisplay = formatCustomerTxPlateDisplay(truckNo, plateNo)
  const paymentValue = Number(paymentAmount)
  const hasPayment = paymentAmount.trim() !== '' && Number.isFinite(paymentValue)
  const paymentDiff = hasPayment ? paymentValue - payablesTotal : 0
  const paymentBalanceLabel =
    !hasPayment || Math.abs(paymentDiff) < 0.005
      ? null
      : paymentDiff > 0
        ? 'over'
        : 'short'

  return (
    <div className="ctx-ledger-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ctx-ledger-modal"
        role="dialog"
        aria-modal="true"
        aria-label={customerLedgerTitle(customerName)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ctx-ledger-modal__header">
          <h2>{customerLedgerTitle(customerName)}</h2>
          <button type="button" className="ctx-ledger-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="ctx-ledger-modal__body">
          <div className="ctx-ledger-receipt">
            <div className="ctx-ledger-receipt__brand">
              <strong>{company.toUpperCase()}</strong>
              <span>CMJ {branch}</span>
            </div>

            <dl className="ctx-ledger-receipt__meta">
              <div>
                <dt>CUSTOMER:</dt>
                <dd className="is-customer">{customerName || '—'}</dd>
              </div>
              <div>
                <dt>PLATE NO.:</dt>
                <dd className="is-meta">{plateDisplay}</dd>
              </div>
              <div>
                <dt>SALES NO.:</dt>
                <dd className="is-meta">{salesNo || '—'}</dd>
              </div>
              <div>
                <dt>INVOICE NO.:</dt>
                <dd className="is-meta">{invoiceNo || '—'}</dd>
              </div>
              <div>
                <dt>DATE:</dt>
                <dd className="is-meta">{dateText || '—'}</dd>
              </div>
            </dl>

            <table className="ctx-ledger-table">
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
                {orderLines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ctx-ledger-table__empty">
                      No order items
                    </td>
                  </tr>
                ) : (
                  orderLines.map((line) => (
                    <tr key={`order-${line.productId}`}>
                      <td>{line.qty}</td>
                      <td>{line.unit}</td>
                      <td className="is-desc">{line.description}</td>
                      <td>{moneyCell(line.price)}</td>
                      <td>{moneyCell(line.discount)}</td>
                      <td>{moneyCell(line.total)}</td>
                      <td className="is-amount-orders">{moneyCell(line.totalAmount)}</td>
                    </tr>
                  ))
                )}
                <tr className="ctx-ledger-table__subtotal">
                  <td colSpan={6}>Total:</td>
                  <td className="is-total is-orders-total">{moneyCell(ordersTotal)}</td>
                </tr>
                <tr className="ctx-ledger-table__section">
                  <td colSpan={7}>E M P T I E S</td>
                </tr>
                {emptiesLines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ctx-ledger-table__empty">
                      No empties
                    </td>
                  </tr>
                ) : (
                  emptiesLines.map((line) => (
                    <tr key={`empty-${line.productId}`}>
                      <td>{line.qty}</td>
                      <td>{line.unit}</td>
                      <td className="is-desc">- {line.description}</td>
                      <td>{moneyCell(line.price)}</td>
                      <td>{moneyCell(line.discount)}</td>
                      <td>{moneyCell(line.total)}</td>
                      <td className="is-amount-empties">{moneyCell(line.totalAmount)}</td>
                    </tr>
                  ))
                )}
                <tr className="ctx-ledger-table__subtotal">
                  <td colSpan={6}>Total:</td>
                  <td className="is-total is-empties-total">{moneyCell(emptiesTotal)}</td>
                </tr>
              </tbody>
            </table>

            <p className="ctx-ledger-receipt__payables">
              <span>TOTAL PAYABLES:</span>
              <strong>{moneyCell(payablesTotal)}</strong>
            </p>
          </div>

          <aside className="ctx-ledger-payment">
            <label className="ctx-ledger-summary">
              <span>Total Orders&apos; amount</span>
              <input type="text" readOnly value={moneyCell(ordersTotal)} className="is-orders" />
            </label>
            <label className="ctx-ledger-summary">
              <span>Total empties amount</span>
              <input type="text" readOnly value={moneyCell(emptiesTotal)} className="is-empties" />
            </label>
            <label className="ctx-ledger-summary">
              <span>Total payables</span>
              <input type="text" readOnly value={moneyCell(payablesTotal)} className="is-payables" />
            </label>

            <h3>Payment</h3>
            <label className="ctx-ledger-field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </label>
            <label className="ctx-ledger-field">
              <span>Cash/Cheque no.</span>
              <input
                type="text"
                value={cashChequeNo}
                onChange={(event) => setCashChequeNo(event.target.value)}
              />
            </label>

            {paymentBalanceLabel ? (
              <p
                className={`ctx-ledger-balance is-${paymentBalanceLabel}`}
                aria-live="polite"
              >
                {paymentBalanceLabel} {moneyCell(Math.abs(paymentDiff))}
              </p>
            ) : null}

            {error ? <p className="ctx-ledger-error">{error}</p> : null}

            <button
              type="button"
              className="ctx-ledger-save"
              disabled={saving}
              onClick={() => onSave({ amount: paymentAmount, cashChequeNo })}
            >
              {saving ? 'Saving…' : saveLabel}
            </button>
          </aside>
        </div>
      </div>
    </div>
  )
}
