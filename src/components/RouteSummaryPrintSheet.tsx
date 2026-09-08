import type { CustomerTransactionCompany } from '../lib/customerTransaction'
import {
  formatRouteMoney,
  formatRouteQty,
  formatRouteSummaryProductName,
  type RouteSummaryBrandBlock,
} from '../lib/routeTransaction'
import './RouteSummaryPrintSheet.css'

export type RouteSummaryPrintEmptiesBucket = {
  key: string
  title: string
  qtyLabel: string
  items: Array<{
    id: string
    label: string
    cases: number
    price: number
    amount: number
  }>
}

export type RouteSummaryPrintSheetData = {
  branch: string
  company: CustomerTransactionCompany
  salesNo: string
  routeAreaName: string
  plateNo: string
  driver: string
  helper: string
  ahente: string
  datePosted: string
  brandBlocks: RouteSummaryBrandBlock[]
  emptiesBuckets: RouteSummaryPrintEmptiesBucket[]
  emptiesTotal: number
  totalSales: number
  discount: number
  expenses: number
  promo: number
  account: number
  subTotal: number
  cashRemittance: number
  shortOver: number
  loadingSalesman: string
  loadingChecker: string
  loadingTestify: string
  unloadingSalesman: string
  unloadingChecker: string
  unloadingTestify: string
}

type RouteSummaryPrintSheetProps = {
  data: RouteSummaryPrintSheetData | null
  active: boolean
  /** `summary` = route transaction summary print; `liquidation` = route/DSL compact sheet. */
  variant?: 'summary' | 'liquidation'
  /**
   * Liquidation only.
   * `stacked` = meta above tables (Route Printables).
   * `dsl` = details left; items + finance tables right (DSL Printables).
   */
  layout?: 'stacked' | 'dsl'
}

function money(value: number) {
  return formatRouteMoney(value)
}

function pesos(value: number) {
  return `P ${money(value)}`
}

function qty(value: number) {
  return formatRouteQty(value)
}

function productLabel(company: CustomerTransactionCompany, brandName: string, productName: string) {
  const product = productName.trim()
  if (company === 'Pepsi') {
    const brand = brandName.trim()
    if (brand && product.toLowerCase().startsWith(`${brand.toLowerCase()} - `)) {
      return product.slice(brand.length + 3).trim() || product
    }
  }
  return product || brandName || '—'
}

/** Pepsi printables: subcategory - product. SMC / Magnolia: product only. */
function liquidationItemLabel(
  company: CustomerTransactionCompany,
  brandName: string,
  productName: string,
) {
  const product = productName.trim()
  const brand = brandName.trim()
  if (company === 'Pepsi') {
    if (brand && product.toLowerCase().startsWith(`${brand.toLowerCase()} - `)) {
      return product
    }
    return formatRouteSummaryProductName(company, brand, product) || '—'
  }
  if (brand && product.toLowerCase().startsWith(`${brand.toLowerCase()} - `)) {
    return product.slice(brand.length + 3).trim() || product
  }
  return product || '—'
}

function compactBlocks(blocks: RouteSummaryBrandBlock[]): RouteSummaryBrandBlock[] {
  return blocks.filter((block) => block.rows.length > 0)
}

function salesRows(
  company: CustomerTransactionCompany,
  blocks: RouteSummaryBrandBlock[],
  withSubcategory: boolean,
) {
  return blocks.flatMap((block) =>
    block.rows
      .filter((row) => Math.abs(row.sales) > 0.0005)
      .map((row) => ({
        id: `${block.brandId}-${row.productId}`,
        label: withSubcategory
          ? liquidationItemLabel(company, block.brandName, row.productName)
          : productLabel(company, block.brandName, row.productName),
        sales: row.sales,
        price: row.price,
        amount: row.amount,
      })),
  )
}

export function RouteSummaryPrintSheet({
  data,
  active,
  variant = 'summary',
  layout = 'stacked',
}: RouteSummaryPrintSheetProps) {
  if (!data) return null

  if (variant === 'liquidation') {
    return <LiquidationPrintSheet data={data} active={active} layout={layout} />
  }

  return <SummaryPrintSheet data={data} active={active} />
}

function SummaryPrintSheet({
  data,
  active,
}: {
  data: RouteSummaryPrintSheetData
  active: boolean
}) {
  const blocks = compactBlocks(data.brandBlocks)
  const emptiesBuckets = data.emptiesBuckets.filter((bucket) => bucket.items.length > 0)
  const shortLabel =
    data.shortOver < -0.005 ? 'SHORT' : data.shortOver > 0.005 ? 'OVER' : 'SHORT/OVER'

  return (
    <div
      className={`rsu-print-sheet rsu-print-sheet--summary${active ? ' is-active' : ''}`}
      aria-hidden={!active}
    >
      <header className="rsu-print-sheet__header">
        <div className="rsu-print-sheet__brand-bar">
          <div className="rsu-print-sheet__sales">
            <span className="rsu-print-sheet__sales-label">Sales no.</span>
            <strong>{data.salesNo || '—'}</strong>
          </div>
          <div className="rsu-print-sheet__titles">
            <p className="rsu-print-sheet__org">The CMJ Corporation</p>
            <p className="rsu-print-sheet__report-title">
              <span className="rsu-print-sheet__company">{data.company}</span>
              <span className="rsu-print-sheet__branch">CMJ {data.branch}</span>
              <span className="rsu-print-sheet__doc">Daily Sales Liquidation Report</span>
            </p>
          </div>
        </div>

        <dl className="rsu-print-sheet__meta">
          <div>
            <dt>Route / area</dt>
            <dd>{data.routeAreaName || '—'}</dd>
          </div>
          <div>
            <dt>Driver</dt>
            <dd>{data.driver || '—'}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{data.datePosted || '—'}</dd>
          </div>
          <div>
            <dt>Plate no.</dt>
            <dd>{data.plateNo || '—'}</dd>
          </div>
          <div>
            <dt>Ahente</dt>
            <dd>{data.ahente || '—'}</dd>
          </div>
          <div>
            <dt>Helper</dt>
            <dd>{data.helper || '—'}</dd>
          </div>
        </dl>
      </header>

      <div className="rsu-print-sheet__body">
        <section className="rsu-print-sheet__fulls" aria-label="Full goods">
          <table>
            <thead>
              <tr>
                <th className="is-name">Full goods</th>
                <th>1st</th>
                <th>2nd</th>
                <th>Total</th>
                <th>RFG</th>
                <th>Sales</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {blocks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="is-empty">
                    No full goods sales for this company.
                  </td>
                </tr>
              ) : (
                blocks.map((block) => (
                  <FragmentBrand
                    key={block.brandId}
                    block={block}
                    company={data.company}
                  />
                ))
              )}
            </tbody>
          </table>
        </section>

        <aside className="rsu-print-sheet__side">
          <section className="rsu-print-sheet__empties" aria-label="Empties">
            <h2>Empties</h2>
            {emptiesBuckets.length === 0 ? (
              <p className="is-empty">No empties recorded.</p>
            ) : (
              emptiesBuckets.map((bucket) => (
                <div key={bucket.key} className="rsu-print-sheet__empties-block">
                  <h3>{bucket.title}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th className="is-name">Item</th>
                        <th>{bucket.qtyLabel}</th>
                        <th>Price</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.items.map((item) => (
                        <tr key={item.id}>
                          <td className="is-name">{item.label}</td>
                          <td className="is-qty is-red">{qty(item.cases)}</td>
                          <td className="is-num">{money(item.price)}</td>
                          <td className="is-num">{money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
            <div className="rsu-print-sheet__empties-total">
              <span>Total</span>
              <strong>{money(data.emptiesTotal)}</strong>
            </div>
          </section>

          <section className="rsu-print-sheet__finance" aria-label="Financial summary">
            <div className="rsu-print-sheet__finance-row is-total">
              <span>Total sales</span>
              <strong>P {money(data.totalSales)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-deduction">
              <span>Ref. empties</span>
              <strong>P {money(data.emptiesTotal)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-deduction">
              <span>Discounts</span>
              <strong>P {money(data.discount)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-deduction">
              <span>Expenses</span>
              <strong>P {money(data.expenses)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-deduction">
              <span>Promo</span>
              <strong>P {money(data.promo)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-deduction">
              <span>Account</span>
              <strong>P {money(data.account)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-subtotal">
              <span>Subtotal</span>
              <strong>P {money(data.subTotal)}</strong>
            </div>
            <div className="rsu-print-sheet__finance-row is-cash">
              <span>Cash remittance</span>
              <strong>P {money(data.cashRemittance)}</strong>
            </div>
            <div
              className={`rsu-print-sheet__finance-row is-short${
                data.shortOver < 0 ? ' is-neg' : data.shortOver > 0 ? ' is-pos' : ''
              }`}
            >
              <span>{shortLabel}</span>
              <strong>P {money(data.shortOver)}</strong>
            </div>
          </section>

          <section className="rsu-print-sheet__crew" aria-label="Loading and unloading">
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>Loading</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Salesman</th>
                  <td>{data.loadingSalesman || '—'}</td>
                </tr>
                <tr>
                  <th>Checker</th>
                  <td>{data.loadingChecker || '—'}</td>
                </tr>
                <tr>
                  <th>Testify</th>
                  <td>{data.loadingTestify || '—'}</td>
                </tr>
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>Unloading</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Salesman</th>
                  <td>{data.unloadingSalesman || '—'}</td>
                </tr>
                <tr>
                  <th>Checker</th>
                  <td>{data.unloadingChecker || '—'}</td>
                </tr>
                <tr>
                  <th>Testify</th>
                  <td>{data.unloadingTestify || '—'}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>
  )
}

function LiquidationPrintSheet({
  data,
  active,
  layout = 'stacked',
}: {
  data: RouteSummaryPrintSheetData
  active: boolean
  layout?: 'stacked' | 'dsl'
}) {
  const rows = salesRows(data.company, data.brandBlocks, true)
  const emptiesItems = data.emptiesBuckets.flatMap((bucket) =>
    bucket.items
      .filter((item) => Math.abs(item.cases) > 0.0005)
      .map((item) => ({
        id: `${bucket.key}-${item.id}`,
        label: item.label,
        cases: item.cases,
        price: item.price,
        amount: item.amount,
      })),
  )
  const shortLabel =
    data.shortOver < -0.005 ? 'SHORT' : data.shortOver > 0.005 ? 'OVER' : 'SHORT/OVER'
  const isDslLayout = layout === 'dsl'

  const masthead = (
    <div className="rsu-liq__masthead">
      <p className="rsu-liq__org">The CMJ Corporation</p>
      <h1 className="rsu-liq__company">{data.company.toUpperCase()}</h1>
      <p className="rsu-liq__doc">
        CMJ {data.branch} Daily Sales Liquidation Report
      </p>
    </div>
  )

  const metaBlock = (
    <div className="rsu-liq__meta">
      <div className="rsu-liq__meta-col">
        <div className="is-route">
          <span>ROUTE/AREA :</span>
          <strong>{data.routeAreaName || '—'}</strong>
        </div>
        <div>
          <span>PLATE NO. :</span>
          <strong>{data.plateNo || '—'}</strong>
        </div>
        <div>
          <span>DRIVER :</span>
          <strong>{data.driver || '—'}</strong>
        </div>
        <div>
          <span>AHENTE :</span>
          <strong>{data.ahente || '—'}</strong>
        </div>
      </div>
      <div className="rsu-liq__meta-col">
        <div>
          <span>SALES NO. :</span>
          <strong>{data.salesNo || '—'}</strong>
        </div>
        <div>
          <span>HELPER :</span>
          <strong>{data.helper || '—'}</strong>
        </div>
        <div>
          <span>DATE :</span>
          <strong>{data.datePosted || '—'}</strong>
        </div>
      </div>
    </div>
  )

  const productsTable = (
    <table className="rsu-liq__table">
      <thead>
        <tr>
          <th className="is-name">Items description</th>
          <th className="is-qty">Sales</th>
          <th className="is-num">Price</th>
          <th className="is-num">Total amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="is-empty">
              No sales items
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id}>
              <td className="is-name">{row.label}</td>
              <td className="is-qty is-red">{qty(row.sales)}</td>
              <td className="is-num">{money(row.price)}</td>
              <td className="is-num">{money(row.amount)}</td>
            </tr>
          ))
        )}

        <tr className="rsu-liq__empties-banner">
          <td colSpan={4}>E M P T I E S</td>
        </tr>

        {emptiesItems.length === 0 ? (
          <tr className="is-empties">
            <td colSpan={4} className="is-empty is-red">
              No empties
            </td>
          </tr>
        ) : (
          emptiesItems.map((item) => (
            <tr key={item.id} className="is-empties">
              <td className="is-name is-red">- {item.label}</td>
              <td className="is-qty is-red">{qty(item.cases)}</td>
              <td className="is-num is-red">{money(item.price)}</td>
              <td className="is-num is-red">{money(item.amount)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )

  const financeTable = (
    <table className="rsu-liq__finance" aria-label="Financial summary">
      <tbody>
        <tr className="is-total">
          <td className="is-label">TOTAL SALES</td>
          <td />
          <td className="is-num is-blue">{pesos(data.totalSales)}</td>
          <td />
        </tr>
        <tr className="is-deduction">
          <td className="is-label">REF. EMPTIES</td>
          <td className="is-num is-red">{pesos(data.emptiesTotal)}</td>
          <td />
          <td />
        </tr>
        <tr className="is-deduction">
          <td className="is-label">DISCOUNTS</td>
          <td className="is-num is-red">{pesos(data.discount)}</td>
          <td />
          <td />
        </tr>
        <tr className="is-deduction">
          <td className="is-label">EXPENSES</td>
          <td className="is-num is-red">{pesos(data.expenses)}</td>
          <td />
          <td />
        </tr>
        <tr className="is-deduction">
          <td className="is-label">PROMO</td>
          <td className="is-num is-red">{pesos(data.promo)}</td>
          <td />
          <td />
        </tr>
        <tr className="is-deduction">
          <td className="is-label">ACCOUNT</td>
          <td className="is-num is-red">{pesos(data.account)}</td>
          <td />
          <td />
        </tr>
        <tr className="is-subtotal">
          <td className="is-label">SUBTOTAL</td>
          <td />
          <td className="is-num is-blue">{pesos(data.subTotal)}</td>
          <td />
        </tr>
        <tr className="is-cash">
          <td className="is-label">CASH REMITTANCE</td>
          <td />
          <td className="is-num is-green">{pesos(data.cashRemittance)}</td>
          <td />
        </tr>
        <tr className="is-short">
          <td className="is-label">{shortLabel}</td>
          <td />
          <td className="is-num is-red">{pesos(data.shortOver)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  )

  const endMark = (
    <div className="rsu-liq__end" aria-hidden="true">
      <span className="rsu-liq__end-line" />
      <span className="rsu-liq__end-label">Nothing follows</span>
      <span className="rsu-liq__end-line" />
    </div>
  )

  return (
    <div
      className={`rsu-print-sheet rsu-print-sheet--liquidation${
        isDslLayout ? ' rsu-print-sheet--dsl' : ''
      }${active ? ' is-active' : ''}`}
      aria-hidden={!active}
    >
      {isDslLayout ? (
        <>
          <header className="rsu-liq__header">{masthead}</header>
          <div className="rsu-liq__dsl-body">
            <div className="rsu-liq__dsl-details">{metaBlock}</div>
            <div className="rsu-liq__dsl-tables">
              {productsTable}
              {financeTable}
              {endMark}
            </div>
          </div>
        </>
      ) : (
        <>
          <header className="rsu-liq__header">
            {masthead}
            {metaBlock}
          </header>
          {productsTable}
          {financeTable}
          {endMark}
        </>
      )}
    </div>
  )
}

function FragmentBrand({
  block,
  company,
}: {
  block: RouteSummaryBrandBlock
  company: CustomerTransactionCompany
}) {
  return (
    <>
      <tr className="is-brand">
        <td colSpan={8}>{block.brandName}</td>
      </tr>
      {block.rows.map((row) => (
        <tr key={row.productId}>
          <td className="is-name">
            {productLabel(company, block.brandName, row.productName)}
          </td>
          <td className="is-qty">{qty(row.firstLoad)}</td>
          <td className="is-qty">{qty(row.secondLoad)}</td>
          <td className="is-qty">{qty(row.total)}</td>
          <td className="is-qty">{qty(row.rfg)}</td>
          <td className="is-qty is-red">{qty(row.sales)}</td>
          <td className="is-num">{money(row.price)}</td>
          <td className="is-num">{money(row.amount)}</td>
        </tr>
      ))}
    </>
  )
}
