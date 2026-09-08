import './CustomerTransactionPrintSheet.css'
import './CollectionPrintSheet.css'

export type CollectionPrintLine = {
  label: string
  qty?: string
  unit?: string
  amount: string
  total: string
  extra?: string
  lacking?: string
  remarks?: string
  kind?: 'line' | 'subtotal'
  description?: string
}

export type CollectionPrintSheetData = {
  id: string
  title: string
  dateLabel: string
  fromName: string
  tid: string
  branchLabel?: string
  dateTimeLabel?: string
  layout?:
    | 'default'
    | 'slip'
    | 'slip_lacking'
    | 'slip_cash'
    | 'slip_cash_short'
    | 'slip_cheque'
    | 'slip_account'
    | 'slip_discount'
  paymentFor?: string
  paymentPc?: string
  paymentSmc?: string
  paymentMag?: string
  plateNo?: string
  cashAmount?: string
  balance?: string
  qtyTotalLabel?: string
  lines: CollectionPrintLine[]
  totalLabel: string
}

type CollectionPrintSheetProps = {
  data: CollectionPrintSheetData
  active?: boolean
}

function SheetHeader({
  title,
  branchLabel,
}: {
  title: string
  branchLabel?: string
}) {
  return (
    <header className="col-print-sheet__brand">
      <h1>{title}</h1>
      <p className="col-print-sheet__branch">{branchLabel ?? 'CMJ Nabunturan'}</p>
      <div className="col-print-sheet__rule" aria-hidden="true" />
    </header>
  )
}

function SheetDate({ label }: { label: string }) {
  return (
    <div className="col-print-sheet__date-row">
      <span>
        <strong>DATE:</strong> {label}
      </span>
    </div>
  )
}

function NothingFollows() {
  return (
    <p className="col-print-sheet__nothing-follows" aria-hidden="true">
      ---------- NOTHING FOLLOWS ----------
    </p>
  )
}

export function CollectionPrintSheet({ data, active = false }: CollectionPrintSheetProps) {
  const layout = data.layout ?? 'default'
  const isSlip =
    layout === 'slip' ||
    layout === 'slip_lacking' ||
    layout === 'slip_cash' ||
    layout === 'slip_cash_short' ||
    layout === 'slip_cheque' ||
    layout === 'slip_account' ||
    layout === 'slip_discount'
  const className = [
    'col-print-sheet',
    isSlip ? 'col-print-sheet--slip' : '',
    layout === 'slip_lacking' ? 'col-print-sheet--slip-lacking' : '',
    layout === 'slip_cash' ? 'col-print-sheet--slip-cash' : '',
    layout === 'slip_cash_short' ? 'col-print-sheet--slip-cash-short' : '',
    layout === 'slip_cheque' ? 'col-print-sheet--slip-cheque' : '',
    layout === 'slip_account' ? 'col-print-sheet--slip-account' : '',
    layout === 'slip_discount' ? 'col-print-sheet--slip-discount' : '',
    active ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const dateLabel = data.dateTimeLabel || data.dateLabel

  if (layout === 'slip_discount') {
    return (
      <article className={className} aria-label={`${data.title} print`}>
        <SheetHeader title={data.title} branchLabel={data.branchLabel} />
        <SheetDate label={dateLabel} />
        <div className="col-print-sheet__plate-row">
          <span>
            <strong>PLATE NO:</strong> {data.plateNo || '—'}
          </span>
        </div>

        <table className="col-print-sheet__table col-print-sheet__table--slip col-print-sheet__table--discount">
          <thead>
            <tr>
              <th>Name</th>
              <th>QTY</th>
              <th>Unit</th>
              <th>description</th>
              <th>Amount</th>
              <th>Total amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={6}>No lines</td>
              </tr>
            ) : (
              data.lines.map((line, index) =>
                line.kind === 'subtotal' ? (
                  <tr key={`${data.id}-sub-${index}`} className="is-subtotal">
                    <td />
                    <td className="is-center is-subtotal-val">{line.qty || ''}</td>
                    <td />
                    <td />
                    <td />
                    <td className="is-center is-subtotal-val">{line.total}</td>
                  </tr>
                ) : (
                  <tr key={`${data.id}-line-${index}`}>
                    <td className="is-name">{line.label}</td>
                    <td className="is-center">{line.qty || ''}</td>
                    <td className="is-center">{line.unit || ''}</td>
                    <td className="is-center">{line.description || 'DISCOUNT'}</td>
                    <td className="is-center">{line.amount}</td>
                    <td className="is-center">{line.total}</td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>

        <div className="col-print-sheet__discount-grand">
          <span className="is-qty">{data.qtyTotalLabel || ''}</span>
          <span className="is-total">{data.totalLabel}</span>
        </div>

        <NothingFollows />
      </article>
    )
  }

  if (layout === 'slip_account') {
    return (
      <article className={className} aria-label={`${data.title} print`}>
        <SheetHeader title={data.title} branchLabel={data.branchLabel} />

        <div className="col-print-sheet__meta-row">
          <span>
            <strong>PLATE NO:</strong> {data.plateNo || '—'}
          </span>
          <span>
            <strong>DATE:</strong> {dateLabel}
          </span>
        </div>

        <div className="col-print-sheet__from-block">
          <strong>{data.fromName || '—'}</strong>
          <span>ACCOUNT</span>
        </div>

        <table className="col-print-sheet__table col-print-sheet__table--slip">
          <thead>
            <tr>
              <th>QTY</th>
              <th>Unit</th>
              <th>Items description</th>
              <th>Price</th>
              <th>Total amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={5}>No lines</td>
              </tr>
            ) : (
              data.lines.map((line, index) => (
                <tr key={`${data.id}-line-${index}`}>
                  <td className="is-center">{line.qty || ''}</td>
                  <td className="is-center">{line.unit || ''}</td>
                  <td className="is-center">{line.label}</td>
                  <td className="is-center">{line.amount}</td>
                  <td className="is-center">{line.total}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="is-center is-bold">{data.qtyTotalLabel || ''}</td>
              <td />
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        </table>

        <div className="col-print-sheet__account-summary">
          <div>
            <span>Total:</span>
            <strong>{data.totalLabel}</strong>
          </div>
          <div>
            <span>Cash:</span>
            <strong className="is-cash">{data.cashAmount || '0.00'}</strong>
          </div>
          <div>
            <span>balance:</span>
            <strong className="is-balance">{data.balance || '0.00'}</strong>
          </div>
        </div>

        <NothingFollows />
      </article>
    )
  }

  if (layout === 'slip_cheque') {
    return (
      <article className={className} aria-label={`${data.title} print`}>
        <SheetHeader title={data.title} branchLabel={data.branchLabel} />
        <SheetDate label={dateLabel} />

        <div className="col-print-sheet__payment-block">
          <strong className="col-print-sheet__payee">{data.fromName || '—'}</strong>
          <span className="col-print-sheet__payment-for">PAYMENT FOR</span>
          {data.paymentPc ? (
            <p>
              <strong>PC # :</strong>
              <span>{data.paymentPc}</span>
            </p>
          ) : null}
          {data.paymentSmc ? (
            <p>
              <strong>SMC # :</strong>
              <span>{data.paymentSmc}</span>
            </p>
          ) : null}
          {data.paymentMag ? (
            <p>
              <strong>MAGNOLIA # :</strong>
              <span>{data.paymentMag}</span>
            </p>
          ) : null}
        </div>

        <table className="col-print-sheet__table col-print-sheet__table--slip col-print-sheet__table--cheque">
          <thead>
            <tr>
              <th>CHEQUE NO</th>
              <th>AMOUNT</th>
              <th>DUE DATE</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={3}>No lines</td>
              </tr>
            ) : (
              data.lines.map((line, index) => (
                <tr key={`${data.id}-line-${index}`}>
                  <td className="is-center">{line.label}</td>
                  <td className="is-center">{line.total || line.amount}</td>
                  <td className="is-center">{line.remarks || line.extra || ''}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td className="is-center is-bold">{data.totalLabel}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        <NothingFollows />
      </article>
    )
  }

  if (layout === 'slip_cash_short') {
    return (
      <article className={className} aria-label={`${data.title} print`}>
        <SheetHeader title={data.title} branchLabel={data.branchLabel} />
        <SheetDate label={dateLabel} />

        <div className="col-print-sheet__from-block">
          <strong className="col-print-sheet__payee">{data.fromName || '—'}</strong>
          <span>FROM</span>
        </div>

        <table className="col-print-sheet__table col-print-sheet__table--slip col-print-sheet__table--cash">
          <thead>
            <tr>
              <th>CHEQUE NO</th>
              <th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={2}>No lines</td>
              </tr>
            ) : (
              data.lines.map((line, index) => (
                <tr key={`${data.id}-line-${index}`}>
                  <td className="is-center">{line.label}</td>
                  <td className="is-center">{line.total || line.amount}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td className="is-center is-bold">{data.totalLabel}</td>
            </tr>
          </tfoot>
        </table>

        <NothingFollows />
      </article>
    )
  }

  if (layout === 'slip_cash') {
    return (
      <article className={className} aria-label={`${data.title} print`}>
        <SheetHeader title={data.title} branchLabel={data.branchLabel} />
        <SheetDate label={dateLabel} />

        <div className="col-print-sheet__payment-block">
          <strong className="col-print-sheet__payee">{data.fromName || '—'}</strong>
          <span className="col-print-sheet__payment-for">PAYMENT FOR</span>
          {data.paymentPc ? (
            <p>
              <strong>PC # :</strong>
              <span>{data.paymentPc}</span>
            </p>
          ) : null}
          {data.paymentSmc ? (
            <p>
              <strong>SMC # :</strong>
              <span>{data.paymentSmc}</span>
            </p>
          ) : null}
          {data.paymentMag ? (
            <p>
              <strong>MAGNOLIA # :</strong>
              <span>{data.paymentMag}</span>
            </p>
          ) : null}
        </div>

        <table className="col-print-sheet__table col-print-sheet__table--slip col-print-sheet__table--cash">
          <thead>
            <tr>
              <th>MODE OF PAYMENT</th>
              <th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={2}>No lines</td>
              </tr>
            ) : (
              data.lines.map((line, index) => (
                <tr key={`${data.id}-line-${index}`}>
                  <td className="is-center">{line.label}</td>
                  <td className="is-center">{line.total || line.amount}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td className="is-center is-bold">{data.totalLabel}</td>
            </tr>
          </tfoot>
        </table>

        <NothingFollows />
      </article>
    )
  }

  if (layout === 'slip' || layout === 'slip_lacking') {
    const isLacking = layout === 'slip_lacking'
    return (
      <article className={className} aria-label={`${data.title} print`}>
        <SheetHeader title={data.title} branchLabel={data.branchLabel} />
        <SheetDate label={dateLabel} />

        <div className="col-print-sheet__from-block">
          <strong>{data.fromName || '—'}</strong>
          <span>FROM</span>
        </div>

        {isLacking ? (
          <table className="col-print-sheet__table col-print-sheet__table--slip">
            <thead>
              <tr>
                <th>QTY</th>
                <th>Unit</th>
                <th>Items description</th>
                <th>Lacking</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={5}>No lines</td>
                </tr>
              ) : (
                data.lines.map((line, index) => (
                  <tr key={`${data.id}-line-${index}`}>
                    <td className="is-center">{line.qty || ''}</td>
                    <td className="is-center">{line.unit || ''}</td>
                    <td className="is-center">{line.label}</td>
                    <td className="is-center">{line.lacking ?? line.amount}</td>
                    <td className="is-center">{line.remarks ?? line.extra ?? ''}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="is-center is-bold">{data.qtyTotalLabel || ''}</td>
                <td />
                <td />
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="col-print-sheet__table col-print-sheet__table--slip">
            <thead>
              <tr>
                <th>QTY</th>
                <th>Unit</th>
                <th>Items description</th>
                <th>Price</th>
                <th>Total amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={5}>No lines</td>
                </tr>
              ) : (
                data.lines.map((line, index) => (
                  <tr key={`${data.id}-line-${index}`}>
                    <td className="is-center">{line.qty || ''}</td>
                    <td className="is-center">{line.unit || ''}</td>
                    <td className="is-center">
                      {line.label}
                      {line.extra ? <em> · {line.extra}</em> : null}
                    </td>
                    <td className="is-center">{line.amount}</td>
                    <td className="is-center">{line.total}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className="is-center is-bold">{data.qtyTotalLabel || ''}</td>
                <td />
                <td />
                <td className="is-right is-bold">Total:</td>
                <td className="is-center is-bold is-total">{data.totalLabel}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <NothingFollows />
      </article>
    )
  }

  return (
    <article className={className} aria-label={`${data.title} print`}>
      <SheetHeader title={data.title} branchLabel={data.branchLabel} />
      <SheetDate label={dateLabel} />

      <div className="col-print-sheet__from-block">
        <strong>{data.fromName || '—'}</strong>
        <span>FROM</span>
      </div>

      {data.paymentFor ? (
        <p className="col-print-sheet__meta-line">
          <strong>Payment for:</strong> {data.paymentFor}
        </p>
      ) : null}
      {data.plateNo ? (
        <p className="col-print-sheet__meta-line">
          <strong>Plate:</strong> {data.plateNo}
        </p>
      ) : null}

      <table className="col-print-sheet__table col-print-sheet__table--slip">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Amount</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.length === 0 ? (
            <tr>
              <td colSpan={5}>No lines</td>
            </tr>
          ) : (
            data.lines.map((line, index) => (
              <tr key={`${data.id}-line-${index}`}>
                <td className="is-center">
                  {line.label}
                  {line.extra ? <em> · {line.extra}</em> : null}
                </td>
                <td className="is-center">{line.qty || ''}</td>
                <td className="is-center">{line.unit || ''}</td>
                <td className="is-center">{line.amount}</td>
                <td className="is-center">{line.total}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <footer className="col-print-sheet__foot">
        <div>
          <span>TOTAL</span>
          <strong className="is-total">{data.totalLabel}</strong>
        </div>
        {data.cashAmount ? (
          <div>
            <span>CASH</span>
            <strong>{data.cashAmount}</strong>
          </div>
        ) : null}
        {data.balance ? (
          <div>
            <span>BAL</span>
            <strong>{data.balance}</strong>
          </div>
        ) : null}
      </footer>

      <NothingFollows />
    </article>
  )
}
