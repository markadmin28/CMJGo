import type { UserBranch } from '../lib/branches'
import {
  collectionOptionLabel,
  type CollectionOptionId,
} from './CollectionOptionsPopover'
import { AccountRoutePanel } from './AccountRoutePanel'
import { CashPaymentForShortPanel } from './CashPaymentForShortPanel'
import { CashPaymentPanel } from './CashPaymentPanel'
import { ChequePaymentPanel } from './ChequePaymentPanel'
import { CollectionPrintablesPanel } from './CollectionPrintablesPanel'
import { DiscountBreakdownPanel } from './DiscountBreakdownPanel'
import { FullsReturnLackingPanel } from './FullsReturnLackingPanel'
import { MtsCollectionsPanel } from './MtsCollectionsPanel'
import { OtherCollectionPanel } from './OtherCollectionPanel'
import './PrintablesPanel.css'
import './CollectionPanel.css'

type CollectionPanelProps = {
  branch?: UserBranch | null
  option: CollectionOptionId
  onClose?: () => void
}

export function CollectionPanel({
  branch = 'Nabunturan',
  option,
  onClose,
}: CollectionPanelProps) {
  const activeBranch = branch ?? 'Nabunturan'
  const title = collectionOptionLabel(option)

  if (option === 'mtsCollections') {
    return (
      <MtsCollectionsPanel
        branch={activeBranch}
        kind="mts_collections"
        onClose={onClose}
      />
    )
  }

  if (option === 'mtsFund') {
    return (
      <MtsCollectionsPanel
        branch={activeBranch}
        kind="mts_fund"
        title="MTS FUND"
        onClose={onClose}
      />
    )
  }

  if (option === 'fullRet') {
    return (
      <MtsCollectionsPanel
        branch={activeBranch}
        kind="fulls_return"
        title="FULLS RETURN"
        onClose={onClose}
      />
    )
  }

  if (option === 'fullsRetLacking') {
    return <FullsReturnLackingPanel branch={activeBranch} onClose={onClose} />
  }

  if (option === 'palletsRet') {
    return (
      <MtsCollectionsPanel
        branch={activeBranch}
        kind="pallets_return"
        title="PALLETS RETURN"
        onClose={onClose}
      />
    )
  }

  if (option === 'palletsPayables') {
    return (
      <MtsCollectionsPanel
        branch={activeBranch}
        kind="pallets_payables"
        title="PALLETS PAYABLES"
        onClose={onClose}
      />
    )
  }

  if (option === 'cashPayment') {
    return (
      <CashPaymentPanel
        branch={activeBranch}
        kind="cash_payment"
        title="CASH PAYMENT"
        onClose={onClose}
      />
    )
  }

  if (option === 'cashPaymentForShort') {
    return <CashPaymentForShortPanel branch={activeBranch} onClose={onClose} />
  }

  if (option === 'chequePayment') {
    return <ChequePaymentPanel branch={activeBranch} onClose={onClose} />
  }

  if (option === 'accRoute') {
    return <AccountRoutePanel branch={activeBranch} onClose={onClose} />
  }

  if (option === 'discountBreakdown') {
    return <DiscountBreakdownPanel branch={activeBranch} onClose={onClose} />
  }

  if (option === 'others') {
    return <OtherCollectionPanel branch={activeBranch} onClose={onClose} />
  }

  if (option === 'collectionPrintables') {
    return <CollectionPrintablesPanel branch={activeBranch} onClose={onClose} />
  }

  return (
    <section className="printables-panel collection-panel" aria-label={title}>
      <header className="printables-panel__head collection-panel__head">
        <h1>{title}</h1>
        <p className="collection-panel__branch">CMJ {activeBranch}</p>
      </header>

      <div className="printables-panel__empty">
        <p className="printables-panel__empty-title">{title}</p>
        <p>
          {title} for {activeBranch} will appear here.
        </p>
      </div>
    </section>
  )
}
