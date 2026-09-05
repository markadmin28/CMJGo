import { useState } from 'react'
import { AddUserModal } from '../components/AddUserModal'
import { CatalogPanel } from '../components/CatalogPanel'
import { CmjGoLogo } from '../components/CmjGoLogo'
import { FthDiscountPanel } from '../components/FthDiscountPanel'
import { FullGoodsPanel } from '../components/FullGoodsPanel'
import {
  PrintablesChooserModal,
  type PrintableOption,
  type PrintablesChooserKind,
} from '../components/PrintablesChooserModal'
import { InventoryChooserModal } from '../components/InventoryChooserModal'
import { InventoryPreviewPanel } from '../components/InventoryPreviewPanel'
import { ActualInventoryPanel } from '../components/ActualInventoryPanel'
import { FactoryTransactionChooserModal } from '../components/FactoryTransactionChooserModal'
import { FactoryTransactionPanel } from '../components/FactoryTransactionPanel'
import { FtPrintablesPanel } from '../components/FtPrintablesPanel'
import type { InventoryCategory } from '../lib/inventoryPreview'
import { factoryTransactionTitle } from '../lib/factoryTransaction'
import { SkuPrintablesPanel } from '../components/SkuPrintablesPanel'
import { BLiquidationPrintablesPanel } from '../components/BLiquidationPrintablesPanel'
import { FullsPrintablesPanel } from '../components/FullsPrintablesPanel'
import { useAuth } from '../contexts/AuthContext'
import {
  canAccessDashboardCard,
  getBranchWorkspaceOptions,
  getDashboardCardsForBranch,
  getUserBranch,
  usesBranchWorkspacePicker,
  type DashboardCardId,
} from '../lib/dashboardModules'
import type { UserBranch } from '../lib/branches'
import skuModuleIcon from '../assets/module-icons/sku-module-icon.png'
import factoryModuleIcon from '../assets/module-icons/factory-module-icon.png'
import ftPrintablesModuleIcon from '../assets/module-icons/ft-printables-module-icon.png'
import skuPrintablesModuleIcon from '../assets/module-icons/sku-printables-module-icon.png'
import fullsPrintablesModuleIcon from '../assets/module-icons/fulls-printables-module-icon.png'
import emptiesPrintablesModuleIcon from '../assets/module-icons/empties-printables-module-icon.png'
import actualInventoryModuleIcon from '../assets/module-icons/actual-inventory-module-icon.png'
import inventoryModuleIcon from '../assets/module-icons/inventory-module-icon.png'
import fthModuleIcon from '../assets/module-icons/fth-module-icon.png'
import fullGoodsModuleIcon from '../assets/module-icons/full-goods-module-icon.png'
import emptiesModuleIcon from '../assets/module-icons/empties-module-icon.png'
import nabunturanBranchIcon from '../assets/module-icons/nabunturan-branch-icon.png'
import davaoBranchIcon from '../assets/module-icons/davao-branch-icon.png'
import './DashboardPage.css'

type DashModule =
  | 'home'
  | 'sku'
  | 'skuPrintables'
  | 'inventory'
  | 'actualInventory'
  | 'factoryTransaction'
  | 'ftPrintables'
  | 'fth'
  | 'fullGoods'
  | 'empties'
  | PrintableOption

type HomeCard = {
  id: DashboardCardId
  className: string
  label: string
  icon: string
  onClick: () => void
}

function ModulePhotoIcon({ src }: { src: string }) {
  return (
    <img
      className="dash-module-btn__photo"
      src={src}
      alt=""
      width={36}
      height={36}
      draggable={false}
    />
  )
}

export function DashboardPage() {
  const { user, signOut, isMasterAdmin } = useAuth()
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [printablesOpen, setPrintablesOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [inventoryCategory, setInventoryCategory] = useState<InventoryCategory>('PCPPI')
  const [factoryOpen, setFactoryOpen] = useState(false)
  const [factoryCategory, setFactoryCategory] = useState<InventoryCategory>('PCPPI')
  const [printablesKind, setPrintablesKind] = useState<PrintablesChooserKind>('fulls')
  const [activeModule, setActiveModule] = useState<DashModule>('home')
  const [workspaceBranch, setWorkspaceBranch] = useState<UserBranch | null>(null)
  const fullName =
    typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null
  const userBranch = getUserBranch(user?.user_metadata as Record<string, unknown> | undefined)
  const needsWorkspacePicker = !isMasterAdmin && usesBranchWorkspacePicker(userBranch)
  const branchOptions = getBranchWorkspaceOptions(userBranch)
  const effectiveBranch = isMasterAdmin
    ? ('Davao' as UserBranch)
    : needsWorkspacePicker
      ? workspaceBranch
      : userBranch
  const allowedCards = getDashboardCardsForBranch(effectiveBranch, {
    isMasterAdmin,
    loginBranch: userBranch,
  })
  const canAccess = (cardId: DashboardCardId) =>
    canAccessDashboardCard(cardId, effectiveBranch, {
      isMasterAdmin,
      loginBranch: userBranch,
    })
  const showBranchPicker = needsWorkspacePicker && workspaceBranch == null && activeModule === 'home'
  const showModuleHome = activeModule === 'home' && !showBranchPicker

  function goHome() {
    setActiveModule('home')
    if (needsWorkspacePicker) setWorkspaceBranch(null)
  }
  const isPrintableModule =
    activeModule === 'skuPrintables' ||
    activeModule === 'fullsPrintables' ||
    activeModule === 'emptiesPrintables' ||
    activeModule === 'bLiquidationFulls' ||
    activeModule === 'bLiquidationEmpties'
  const isInventoryModule = activeModule === 'inventory'
  const isActualInventoryModule = activeModule === 'actualInventory'
  const isFactoryModule = activeModule === 'factoryTransaction'
  const isFtPrintablesModule = activeModule === 'ftPrintables'

  function openPrintablesChooser(kind: PrintablesChooserKind) {
    setPrintablesKind(kind)
    setPrintablesOpen(true)
  }

  function handlePrintableSelect(option: PrintableOption) {
    setPrintablesOpen(false)
    setActiveModule(option)
  }

  function handleInventorySelect(category: InventoryCategory) {
    setInventoryOpen(false)
    setInventoryCategory(category)
    setActiveModule('inventory')
  }

  function handleFactorySelect(category: InventoryCategory) {
    setFactoryOpen(false)
    setFactoryCategory(category)
    setActiveModule('factoryTransaction')
  }

  const homeCards: HomeCard[] = [
    {
      id: 'sku',
      className: 'dash-module-btn--sku',
      label: 'Stock Keeping Unit',
      icon: skuModuleIcon,
      onClick: () => setActiveModule('sku'),
    },
    {
      id: 'fth',
      className: 'dash-module-btn--fth',
      label: 'FTH Discount',
      icon: fthModuleIcon,
      onClick: () => setActiveModule('fth'),
    },
    {
      id: 'fullGoods',
      className: 'dash-module-btn--fullGoods',
      label: 'Full Goods In/Out',
      icon: fullGoodsModuleIcon,
      onClick: () => setActiveModule('fullGoods'),
    },
    {
      id: 'empties',
      className: 'dash-module-btn--empties',
      label: 'Empties In/Out',
      icon: emptiesModuleIcon,
      onClick: () => setActiveModule('empties'),
    },
    {
      id: 'factory',
      className: 'dash-module-btn--factory',
      label: 'Fractory Transaction',
      icon: factoryModuleIcon,
      onClick: () => setFactoryOpen(true),
    },
    {
      id: 'ftPrintables',
      className: 'dash-module-btn--ftPrintables',
      label: 'FT Printables',
      icon: ftPrintablesModuleIcon,
      onClick: () => setActiveModule('ftPrintables'),
    },
    {
      id: 'skuPrintables',
      className: 'dash-module-btn--skuPrintables',
      label: 'SKU Printables',
      icon: skuPrintablesModuleIcon,
      onClick: () => setActiveModule('skuPrintables'),
    },
    {
      id: 'fullsPrintables',
      className: 'dash-module-btn--printables',
      label: 'Fulls In/Out Printables',
      icon: fullsPrintablesModuleIcon,
      onClick: () => openPrintablesChooser('fulls'),
    },
    {
      id: 'emptiesPrintables',
      className: 'dash-module-btn--emptiesPrintables',
      label: 'Empties In/Out Printables',
      icon: emptiesPrintablesModuleIcon,
      onClick: () => openPrintablesChooser('empties'),
    },
    {
      id: 'actualInventory',
      className: 'dash-module-btn--actualInventory',
      label: 'Actual Inventory',
      icon: actualInventoryModuleIcon,
      onClick: () => setActiveModule('actualInventory'),
    },
    {
      id: 'inventory',
      className: 'dash-module-btn--inventory',
      label: 'Inventory',
      icon: inventoryModuleIcon,
      onClick: () => setInventoryOpen(true),
    },
  ]

  const visibleHomeCards = homeCards.filter((card) => allowedCards.includes(card.id))
  const skuStackIds = new Set<DashboardCardId>(['sku', 'fth', 'fullGoods', 'empties'])
  const isCompactModules = needsWorkspacePicker && workspaceBranch === 'Davao'
  const skuStackCards = visibleHomeCards.filter((card) => skuStackIds.has(card.id))
  const otherHomeCards = visibleHomeCards.filter((card) => !skuStackIds.has(card.id))
  const useSkuStack = !isCompactModules && skuStackCards.some((card) => card.id === 'sku')

  function renderHomeCard(card: HomeCard) {
    return (
      <button
        key={card.id}
        type="button"
        className={`dash-module-btn ${card.className}`}
        onClick={card.onClick}
      >
        <span className="dash-module-btn__icon">
          <ModulePhotoIcon src={card.icon} />
        </span>
        <span className="dash-module-btn__label">{card.label}</span>
      </button>
    )
  }

  return (
    <div className="dash-shell">
      <div className="dash-glow" aria-hidden="true" />

      <header className="dash-header">
        <div className="dash-header-inner">
          <button
            type="button"
            className="dash-logo-btn"
            onClick={goHome}
            aria-label="Go to home"
          >
            <CmjGoLogo size="sm" />
          </button>
          <div className="dash-header-actions">
            <div className="dash-user-chip" title={user?.email ?? undefined}>
              <span className="dash-user-avatar">{(fullName ?? user?.email ?? 'U').slice(0, 1)}</span>
              <span className="dash-user-meta">
                <span className="dash-user-name">{fullName ?? 'User'}</span>
                {isMasterAdmin ? (
                  <span className="dash-user-role">Admin</span>
                ) : userBranch ? (
                  <span className="dash-user-role">{userBranch}</span>
                ) : null}
              </span>
            </div>
            {isMasterAdmin ? (
              <button type="button" className="dash-add-user" onClick={() => setAddUserOpen(true)}>
                Add user
              </button>
            ) : null}
            <button type="button" className="dash-signout" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="dash-main">
        {showBranchPicker ? (
          <section className="dash-modules dash-modules--branches" aria-label="Branches">
            {branchOptions.map((branch) => (
              <button
                key={branch}
                type="button"
                className={
                  branch === 'Nabunturan'
                    ? 'dash-module-btn dash-module-btn--branch-nabunturan'
                    : 'dash-module-btn dash-module-btn--branch-davao'
                }
                onClick={() => {
                  setWorkspaceBranch(branch)
                  setActiveModule('home')
                }}
              >
                <span className="dash-module-btn__icon">
                  <ModulePhotoIcon
                    src={branch === 'Nabunturan' ? nabunturanBranchIcon : davaoBranchIcon}
                  />
                </span>
                <span className="dash-module-btn__label">{branch}</span>
              </button>
            ))}
          </section>
        ) : null}

        {showModuleHome ? (
          visibleHomeCards.length > 0 ? (
            <section
              className={
                isCompactModules
                  ? 'dash-modules dash-modules--compact'
                  : useSkuStack
                    ? 'dash-modules dash-modules--with-sku-stack'
                    : 'dash-modules'
              }
              aria-label="Modules"
            >
              {needsWorkspacePicker && workspaceBranch ? (
                <div className="dash-workspace-bar">
                  <button type="button" className="btn-secondary dash-workspace-back" onClick={goHome}>
                    ← Branches
                  </button>
                  <span className="dash-workspace-label">{workspaceBranch}</span>
                </div>
              ) : null}
              {useSkuStack ? (
                <>
                  <div className="dash-modules-sku-stack">{skuStackCards.map(renderHomeCard)}</div>
                  <div className="dash-modules-main-row">{otherHomeCards.map(renderHomeCard)}</div>
                </>
              ) : (
                visibleHomeCards.map(renderHomeCard)
              )}
            </section>
          ) : (
            <div className="dash-modules-empty" role="status">
              {needsWorkspacePicker && workspaceBranch ? (
                <button type="button" className="btn-secondary dash-workspace-back" onClick={goHome}>
                  ← Branches
                </button>
              ) : null}
              <p className="dash-modules-empty__title">No modules for this branch yet</p>
              <p>
                {effectiveBranch
                  ? `${effectiveBranch} dashboard cards are not set up yet.`
                  : 'Your account has no branch assigned.'}
              </p>
            </div>
          )
        ) : null}

        {activeModule !== 'home' ? (
          <div className="dash-module-bar">
            {needsWorkspacePicker && workspaceBranch ? (
              <button type="button" className="dash-module-tab" onClick={goHome}>
                {workspaceBranch}
              </button>
            ) : null}
            {canAccess('sku') ? (
              <button
                type="button"
                className={
                  activeModule === 'sku' ? 'dash-module-tab is-active' : 'dash-module-tab'
                }
                onClick={() => setActiveModule('sku')}
              >
                Stock Keeping Unit
              </button>
            ) : null}
            {canAccess('fth') ? (
              <button
                type="button"
                className={
                  activeModule === 'fth' ? 'dash-module-tab is-active' : 'dash-module-tab'
                }
                onClick={() => setActiveModule('fth')}
              >
                FTH Discount
              </button>
            ) : null}
            {canAccess('fullGoods') ? (
              <button
                type="button"
                className={
                  activeModule === 'fullGoods' ? 'dash-module-tab is-active' : 'dash-module-tab'
                }
                onClick={() => setActiveModule('fullGoods')}
              >
                Full Goods In/Out
              </button>
            ) : null}
            {canAccess('empties') ? (
              <button
                type="button"
                className={
                  activeModule === 'empties' ? 'dash-module-tab is-active' : 'dash-module-tab'
                }
                onClick={() => setActiveModule('empties')}
              >
                Empties In/Out
              </button>
            ) : null}
            {isActualInventoryModule && canAccess('actualInventory') ? (
              <button
                type="button"
                className="dash-module-tab is-active"
                onClick={() => setActiveModule('actualInventory')}
              >
                Actual Inventory
              </button>
            ) : null}
            {isInventoryModule && canAccess('inventory') ? (
              <button
                type="button"
                className="dash-module-tab is-active"
                onClick={() => setActiveModule('inventory')}
              >
                {inventoryCategory} Inventory
              </button>
            ) : null}
            {isFactoryModule && canAccess('factory') ? (
              <button
                type="button"
                className="dash-module-tab is-active"
                onClick={() => setActiveModule('factoryTransaction')}
              >
                {factoryTransactionTitle(factoryCategory)} Fractory
              </button>
            ) : null}
            {isFtPrintablesModule && canAccess('ftPrintables') ? (
              <button
                type="button"
                className="dash-module-tab is-active"
                onClick={() => setActiveModule('ftPrintables')}
              >
                FT Printables
              </button>
            ) : null}
            {isPrintableModule ? (
              <>
                {canAccess('skuPrintables') ? (
                  <button
                    type="button"
                    className={
                      activeModule === 'skuPrintables'
                        ? 'dash-module-tab is-active'
                        : 'dash-module-tab'
                    }
                    onClick={() => setActiveModule('skuPrintables')}
                  >
                    SKU Printables
                  </button>
                ) : null}
                {canAccess('fullsPrintables') ? (
                  <button
                    type="button"
                    className={
                      activeModule === 'fullsPrintables'
                        ? 'dash-module-tab is-active'
                        : 'dash-module-tab'
                    }
                    onClick={() => setActiveModule('fullsPrintables')}
                  >
                    Fulls In/Out
                  </button>
                ) : null}
                {canAccess('fullsPrintables') ? (
                  <button
                    type="button"
                    className={
                      activeModule === 'bLiquidationFulls'
                        ? 'dash-module-tab is-active'
                        : 'dash-module-tab'
                    }
                    onClick={() => setActiveModule('bLiquidationFulls')}
                  >
                    Full B-Liquidation
                  </button>
                ) : null}
                {canAccess('emptiesPrintables') ? (
                  <button
                    type="button"
                    className={
                      activeModule === 'emptiesPrintables'
                        ? 'dash-module-tab is-active'
                        : 'dash-module-tab'
                    }
                    onClick={() => setActiveModule('emptiesPrintables')}
                  >
                    Empties In/Out
                  </button>
                ) : null}
                {canAccess('emptiesPrintables') ? (
                  <button
                    type="button"
                    className={
                      activeModule === 'bLiquidationEmpties'
                        ? 'dash-module-tab is-active'
                        : 'dash-module-tab'
                    }
                    onClick={() => setActiveModule('bLiquidationEmpties')}
                  >
                    Empties B-Liquidation
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {activeModule === 'sku' && canAccess('sku') ? <CatalogPanel /> : null}
        {activeModule === 'skuPrintables' && canAccess('skuPrintables') ? (
          <SkuPrintablesPanel />
        ) : null}
        {activeModule === 'actualInventory' && canAccess('actualInventory') ? (
          <ActualInventoryPanel />
        ) : null}
        {activeModule === 'inventory' && canAccess('inventory') ? (
          <InventoryPreviewPanel category={inventoryCategory} />
        ) : null}
        {activeModule === 'factoryTransaction' && canAccess('factory') ? (
          <FactoryTransactionPanel category={factoryCategory} />
        ) : null}
        {activeModule === 'ftPrintables' && canAccess('ftPrintables') ? (
          <FtPrintablesPanel />
        ) : null}
        {activeModule === 'fth' && canAccess('fth') ? <FthDiscountPanel /> : null}
        {activeModule === 'fullGoods' && canAccess('fullGoods') ? (
          <FullGoodsPanel mode="fullGoods" />
        ) : null}
        {activeModule === 'empties' && canAccess('empties') ? (
          <FullGoodsPanel mode="empties" />
        ) : null}
        {activeModule === 'fullsPrintables' && canAccess('fullsPrintables') ? (
          <FullsPrintablesPanel mode="fulls" />
        ) : null}
        {activeModule === 'emptiesPrintables' && canAccess('emptiesPrintables') ? (
          <FullsPrintablesPanel mode="empties" />
        ) : null}
        {activeModule === 'bLiquidationFulls' && canAccess('fullsPrintables') ? (
          <BLiquidationPrintablesPanel mode="fulls" />
        ) : null}
        {activeModule === 'bLiquidationEmpties' && canAccess('emptiesPrintables') ? (
          <BLiquidationPrintablesPanel mode="empties" />
        ) : null}
      </main>

      <PrintablesChooserModal
        open={printablesOpen}
        kind={printablesKind}
        onClose={() => setPrintablesOpen(false)}
        onSelect={handlePrintableSelect}
      />

      <InventoryChooserModal
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        onSelect={handleInventorySelect}
      />

      <FactoryTransactionChooserModal
        open={factoryOpen}
        onClose={() => setFactoryOpen(false)}
        onSelect={handleFactorySelect}
      />

      {isMasterAdmin ? (
        <AddUserModal open={addUserOpen} onClose={() => setAddUserOpen(false)} />
      ) : null}
    </div>
  )
}
