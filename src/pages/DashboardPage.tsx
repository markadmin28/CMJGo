import { useState, type MouseEvent } from 'react'
import { AddUserModal } from '../components/AddUserModal'
import { CatalogPanel } from '../components/CatalogPanel'
import { CmjGoLogo } from '../components/CmjGoLogo'
import { CustomersDiscountPanel } from '../components/CustomersDiscountPanel'
import { FthDiscountPanel } from '../components/FthDiscountPanel'
import { FullGoodsPanel } from '../components/FullGoodsPanel'
import { FullGoodsReviewPanel } from '../components/FullGoodsReviewPanel'
import {
  PrintablesChooserModal,
  type PrintableOption,
  type PrintablesChooserKind,
} from '../components/PrintablesChooserModal'
import { InventoryPreviewPanel } from '../components/InventoryPreviewPanel'
import { CollectionPanel } from '../components/CollectionPanel'
import { ActualInventoryPanel } from '../components/ActualInventoryPanel'
import { FactoryTransactionChooserModal } from '../components/FactoryTransactionChooserModal'
import { FactoryTransactionPanel } from '../components/FactoryTransactionPanel'
import { FtPrintablesPanel } from '../components/FtPrintablesPanel'
import type { InventoryCategory } from '../lib/inventoryPreview'
import { SkuPrintablesPanel } from '../components/SkuPrintablesPanel'
import { CustomerPrintablesPanel } from '../components/CustomerPrintablesPanel'
import { RoutePrintablesPanel } from '../components/RoutePrintablesPanel'
import { DslPrintablesPanel } from '../components/DslPrintablesPanel'
import { DailySalesLiquidationPanel } from '../components/DailySalesLiquidationPanel'
import { BLiquidationPrintablesPanel } from '../components/BLiquidationPrintablesPanel'
import { FullsPrintablesPanel } from '../components/FullsPrintablesPanel'
import { BoBadOrderPanel } from '../components/BoBadOrderPanel'
import {
  CustomerTransactionOptionsPopover,
  type CustomerTransactionOption,
} from '../components/CustomerTransactionOptionsPopover'
import {
  RouteTransactionOptionsPopover,
  type RouteTransactionOption,
} from '../components/RouteTransactionOptionsPopover'
import {
  DailyGoodsOptionsPopover,
  type DailyGoodsCompany,
  type DailyGoodsMenuKind,
} from '../components/DailyGoodsOptionsPopover'
import { ReviewOptionsPopover, type ReviewOptionId } from '../components/ReviewOptionsPopover'
import {
  ActualInventoryOptionsPopover,
  type ActualInventoryCompany,
} from '../components/ActualInventoryOptionsPopover'
import { InventoryOptionsPopover } from '../components/InventoryOptionsPopover'
import {
  CollectionOptionsPopover,
  type CollectionOptionId,
} from '../components/CollectionOptionsPopover'
import { DslOptionsPopover } from '../components/DslOptionsPopover'
import { CustomerTransactionPanel } from '../components/CustomerTransactionPanel'
import { RouteTransactionPanel } from '../components/RouteTransactionPanel'
import {
  type CustomerTransactionCompany,
} from '../lib/customerTransaction'
import { SkuOptionsPopover, type SkuOption } from '../components/SkuOptionsPopover'
import { DashboardChatPanel } from '../components/DashboardChatPanel'
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
import boModuleIcon from '../assets/module-icons/bo-module-icon.png'
import nabunturanBranchIcon from '../assets/module-icons/nabunturan-branch-icon.png'
import davaoBranchIcon from '../assets/module-icons/davao-branch-icon.png'
import './DashboardPage.css'

type DashModule =
  | 'home'
  | 'sku'
  | 'skuCustomersDiscount'
  | 'customerTransaction'
  | 'routeTransactions'
  | 'customerPrintables'
  | 'routePrintables'
  | 'dslPrintables'
  | 'dailySalesLiquidation'
  | 'fullGoodsDailyIn'
  | 'emptiesDailyIn'
  | 'emptiesDailyOut'
  | 'fullGoodsReview'
  | 'emptiesReview'
  | 'skuPrintables'
  | 'inventory'
  | 'actualInventory'
  | 'collection'
  | 'factoryTransaction'
  | 'ftPrintables'
  | 'fth'
  | 'fullGoods'
  | 'empties'
  | 'bo'
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
  const [printablesMenuPos, setPrintablesMenuPos] = useState({ top: 0, left: 0 })
  const [inventoryCategory, setInventoryCategory] = useState<InventoryCategory>('PCPPI')
  const [factoryOpen, setFactoryOpen] = useState(false)
  const [factoryMenuPos, setFactoryMenuPos] = useState({ top: 0, left: 0 })
  const [factoryCategory, setFactoryCategory] = useState<InventoryCategory>('PCPPI')
  const [printablesKind, setPrintablesKind] = useState<PrintablesChooserKind>('fulls')
  const [activeModule, setActiveModule] = useState<DashModule>('home')
  const [workspaceBranch, setWorkspaceBranch] = useState<UserBranch | null>(null)
  const [skuMenuOpen, setSkuMenuOpen] = useState(false)
  const [skuMenuPos, setSkuMenuPos] = useState({ top: 0, left: 0 })
  const [customerTxMenuOpen, setCustomerTxMenuOpen] = useState(false)
  const [customerTxMenuPos, setCustomerTxMenuPos] = useState({ top: 0, left: 0 })
  const [customerTxCompany, setCustomerTxCompany] =
    useState<CustomerTransactionCompany>('Pepsi')
  const [routeTxMenuOpen, setRouteTxMenuOpen] = useState(false)
  const [routeTxMenuPos, setRouteTxMenuPos] = useState({ top: 0, left: 0 })
  const [routeTxOption, setRouteTxOption] = useState<RouteTransactionOption>('firstLoad')
  const [dailyGoodsMenuKind, setDailyGoodsMenuKind] = useState<DailyGoodsMenuKind | null>(null)
  const [dailyGoodsMenuPos, setDailyGoodsMenuPos] = useState({ top: 0, left: 0 })
  const [dailyGoodsCompany, setDailyGoodsCompany] = useState<DailyGoodsCompany>('Pepsi')
  const [reviewMenuOpen, setReviewMenuOpen] = useState(false)
  const [reviewMenuPos, setReviewMenuPos] = useState({ top: 0, left: 0 })
  const [actualInventoryMenuOpen, setActualInventoryMenuOpen] = useState(false)
  const [actualInventoryMenuPos, setActualInventoryMenuPos] = useState({ top: 0, left: 0 })
  const [actualInventoryCompany, setActualInventoryCompany] =
    useState<ActualInventoryCompany>('Pepsi')
  const [inventoryMenuOpen, setInventoryMenuOpen] = useState(false)
  const [inventoryMenuPos, setInventoryMenuPos] = useState({ top: 0, left: 0 })
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false)
  const [collectionMenuPos, setCollectionMenuPos] = useState({ top: 0, left: 0 })
  const [collectionOption, setCollectionOption] =
    useState<CollectionOptionId>('mtsCollections')
  const [dslMenuOpen, setDslMenuOpen] = useState(false)
  const [dslMenuPos, setDslMenuPos] = useState({ top: 0, left: 0 })
  const [dslCompany, setDslCompany] = useState<CustomerTransactionCompany>('Pepsi')
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

  function closeMenus() {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setReviewMenuOpen(false)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
  }

  /** Return to the current workspace module cards (keep Davao / Nabunturan selection). */
  function goHome() {
    closeMenus()
    setActiveModule('home')
  }

  /** Maragusan only: leave workspace and show Nabunturan / Davao branch cards. */
  function goBranchPicker() {
    closeMenus()
    setActiveModule('home')
    if (needsWorkspacePicker) setWorkspaceBranch(null)
  }
  function openPrintablesChooser(
    kind: PrintablesChooserKind,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setPrintablesMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setPrintablesKind(kind)
    setPrintablesOpen(true)
  }

  function handlePrintableSelect(option: PrintableOption) {
    setPrintablesOpen(false)
    setActiveModule(option)
  }

  function handleFactorySelect(category: InventoryCategory) {
    setFactoryOpen(false)
    setFactoryCategory(category)
    setActiveModule('factoryTransaction')
  }

  function openFactoryMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setReviewMenuOpen(false)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setFactoryMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setFactoryOpen(true)
  }

  function openSkuMenu(event: MouseEvent<HTMLButtonElement>) {
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setSkuMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setSkuMenuOpen(true)
  }

  function openCustomerTxMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setCustomerTxMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setCustomerTxMenuOpen(true)
  }

  function openRouteTxMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setRouteTxMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setRouteTxMenuOpen(true)
  }

  function openDailyGoodsMenu(
    kind: DailyGoodsMenuKind,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setReviewMenuOpen(false)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setDailyGoodsMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setDailyGoodsMenuKind(kind)
  }

  function openReviewMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setReviewMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setReviewMenuOpen(true)
  }

  function handleReviewOption(option: ReviewOptionId) {
    setReviewMenuOpen(false)
    setActiveModule(option)
  }

  function openActualInventoryMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setReviewMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setActualInventoryMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setActualInventoryMenuOpen(true)
  }

  function openInventoryMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setActualInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setInventoryMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setInventoryMenuOpen(true)
  }

  function openCollectionMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setReviewMenuOpen(false)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setDslMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setCollectionMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setCollectionMenuOpen(true)
  }

  function openDslMenu(event: MouseEvent<HTMLButtonElement>) {
    setSkuMenuOpen(false)
    setCustomerTxMenuOpen(false)
    setRouteTxMenuOpen(false)
    setDailyGoodsMenuKind(null)
    setReviewMenuOpen(false)
    setActualInventoryMenuOpen(false)
    setInventoryMenuOpen(false)
    setCollectionMenuOpen(false)
    setPrintablesOpen(false)
    setFactoryOpen(false)
    const rect = event.currentTarget.getBoundingClientRect()
    setDslMenuPos({
      top: rect.top,
      left: rect.right + 10,
    })
    setDslMenuOpen(true)
  }

  function handleDslOption(company: CustomerTransactionCompany) {
    setDslMenuOpen(false)
    setDslCompany(company)
    setActiveModule('dailySalesLiquidation')
  }

  function handleSkuOption(option: SkuOption) {
    setSkuMenuOpen(false)
    if (option === 'customersDiscount') {
      setActiveModule('skuCustomersDiscount')
      return
    }
    setActiveModule('sku')
  }

  function handleCustomerTxOption(option: CustomerTransactionOption) {
    setCustomerTxMenuOpen(false)
    const companyMap = {
      pepsi: 'Pepsi',
      smc: 'SMC',
      magnolia: 'Magnolia',
    } as const
    setCustomerTxCompany(companyMap[option])
    setActiveModule('customerTransaction')
  }

  function handleRouteTxOption(option: RouteTransactionOption) {
    setRouteTxMenuOpen(false)
    setRouteTxOption(option)
    setActiveModule('routeTransactions')
  }

  function handleDailyGoodsOption(company: DailyGoodsCompany) {
    const kind = dailyGoodsMenuKind
    setDailyGoodsMenuKind(null)
    if (!kind) return
    setDailyGoodsCompany(company)
    setActiveModule(kind)
  }

  function handleActualInventoryOption(company: ActualInventoryCompany) {
    setActualInventoryMenuOpen(false)
    setActualInventoryCompany(company)
    setActiveModule('actualInventory')
  }

  function handleInventoryMenuSelect(category: InventoryCategory) {
    setInventoryMenuOpen(false)
    setInventoryCategory(category)
    setActiveModule('inventory')
  }

  function handleCollectionOption(option: CollectionOptionId) {
    setCollectionMenuOpen(false)
    setCollectionOption(option)
    setActiveModule('collection')
  }

  const homeCards: HomeCard[] = [
    {
      id: 'sku',
      className: 'dash-module-btn--sku',
      label: 'Stock Keeping Unit',
      icon: skuModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'customerTransaction',
      className: 'dash-module-btn--customerTransaction',
      label: 'Customer Transaction',
      icon: factoryModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'routeTransactions',
      className: 'dash-module-btn--routeTransactions',
      label: 'Route Transactions',
      icon: inventoryModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'fullGoodsDailyIn',
      className: 'dash-module-btn--fullGoodsDailyIn',
      label: 'Full Goods Daily In',
      icon: fullGoodsModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'emptiesDailyIn',
      className: 'dash-module-btn--emptiesDailyIn',
      label: 'Empties Daily In',
      icon: emptiesModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'emptiesDailyOut',
      className: 'dash-module-btn--emptiesDailyOut',
      label: 'Empties Daily Out',
      icon: emptiesModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'review',
      className: 'dash-module-btn--fullGoodsReview',
      label: 'Review',
      icon: fullGoodsModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'customerPrintables',
      className: 'dash-module-btn--customerPrintables',
      label: 'Customer Printables',
      icon: skuPrintablesModuleIcon,
      onClick: () => setActiveModule('customerPrintables'),
    },
    {
      id: 'routePrintables',
      className: 'dash-module-btn--routePrintables',
      label: 'Route Printables',
      icon: fullsPrintablesModuleIcon,
      onClick: () => setActiveModule('routePrintables'),
    },
    {
      id: 'dslPrintables',
      className: 'dash-module-btn--dslPrintables',
      label: 'DSL Printables',
      icon: skuPrintablesModuleIcon,
      onClick: () => setActiveModule('dslPrintables'),
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
      id: 'bo',
      className: 'dash-module-btn--bo',
      label: 'BO (Bad Order)',
      icon: boModuleIcon,
      onClick: () => setActiveModule('bo'),
    },
    {
      id: 'factory',
      className: 'dash-module-btn--factory',
      label: 'Fractory Transaction',
      icon: factoryModuleIcon,
      onClick: () => undefined,
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
      onClick: () => undefined,
    },
    {
      id: 'emptiesPrintables',
      className: 'dash-module-btn--emptiesPrintables',
      label: 'Empties In/Out Printables',
      icon: emptiesPrintablesModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'actualInventory',
      className: 'dash-module-btn--actualInventory',
      label: 'Actual Inventory',
      icon: actualInventoryModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'inventory',
      className: 'dash-module-btn--inventory',
      label: 'Inventory',
      icon: inventoryModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'collection',
      className: 'dash-module-btn--collection',
      label: 'Collection',
      icon: fthModuleIcon,
      onClick: () => undefined,
    },
    {
      id: 'dailySalesLiquidation',
      className: 'dash-module-btn--dailySalesLiquidation',
      label: 'Daily Sales Liquidation Report',
      icon: skuPrintablesModuleIcon,
      onClick: () => undefined,
    },
  ]

  const visibleHomeCards = homeCards.filter((card) => allowedCards.includes(card.id))
  const skuStackIds = new Set<DashboardCardId>([
    'sku',
    'customerTransaction',
    'routeTransactions',
    'fullGoodsDailyIn',
    'emptiesDailyIn',
    'emptiesDailyOut',
    'fth',
    'fullGoods',
    'empties',
    'bo',
  ])
  const skuStackCards = visibleHomeCards.filter((card) => skuStackIds.has(card.id))
  const otherHomeCards = visibleHomeCards.filter((card) => !skuStackIds.has(card.id))
  const useSkuStack = skuStackCards.some((card) => card.id === 'sku')

  function renderHomeCard(card: HomeCard) {
    return (
      <button
        key={card.id}
        type="button"
        className={`dash-module-btn ${card.className}`}
        onClick={(event) => {
          if (card.id === 'sku') {
            if (effectiveBranch === 'Nabunturan') {
              openSkuMenu(event)
              return
            }
            setActiveModule('sku')
            return
          }
          if (card.id === 'customerTransaction') {
            openCustomerTxMenu(event)
            return
          }
          if (card.id === 'routeTransactions') {
            openRouteTxMenu(event)
            return
          }
          if (card.id === 'fullGoodsDailyIn') {
            openDailyGoodsMenu('fullGoodsDailyIn', event)
            return
          }
          if (card.id === 'emptiesDailyIn') {
            openDailyGoodsMenu('emptiesDailyIn', event)
            return
          }
          if (card.id === 'emptiesDailyOut') {
            openDailyGoodsMenu('emptiesDailyOut', event)
            return
          }
          if (card.id === 'review') {
            openReviewMenu(event)
            return
          }
          if (card.id === 'actualInventory') {
            if (effectiveBranch === 'Nabunturan') {
              openActualInventoryMenu(event)
              return
            }
            setActiveModule('actualInventory')
            return
          }
          if (card.id === 'inventory') {
            openInventoryMenu(event)
            return
          }
          if (card.id === 'factory') {
            openFactoryMenu(event)
            return
          }
          if (card.id === 'collection') {
            openCollectionMenu(event)
            return
          }
          if (card.id === 'dailySalesLiquidation') {
            openDslMenu(event)
            return
          }
          if (card.id === 'fullsPrintables') {
            openPrintablesChooser('fulls', event)
            return
          }
          if (card.id === 'emptiesPrintables') {
            openPrintablesChooser('empties', event)
            return
          }
          card.onClick()
        }}
      >
        <span className="dash-module-btn__icon">
          <ModulePhotoIcon src={card.icon} />
        </span>
        <span className="dash-module-btn__label">{card.label}</span>
      </button>
    )
  }

  const showHomeChrome = activeModule === 'home'

  return (
    <div className="dash-shell">
      {showHomeChrome ? <div className="dash-bg" aria-hidden="true" /> : null}
      <div className="dash-glow" aria-hidden="true" />

      <header className="dash-header no-print">
        <div className="dash-header-inner">
          <div className="dash-header-brand">
            <button
              type="button"
              className="dash-logo-btn"
              onClick={goHome}
              aria-label="Go to home"
            >
              <CmjGoLogo size="sm" showWordmark className="dash-logo" />
            </button>
            {needsWorkspacePicker && workspaceBranch ? (
              <div className="dash-workspace-inline" aria-label={`Workspace ${workspaceBranch}`}>
                <button
                  type="button"
                  className="dash-back-btn dash-workspace-inline__branches"
                  onClick={goBranchPicker}
                >
                  ← Branches
                </button>
                <span className="dash-workspace-inline__label">{workspaceBranch}</span>
              </div>
            ) : null}
            {!showHomeChrome && !showBranchPicker ? (
              <button
                type="button"
                className="dash-back-btn"
                onClick={goHome}
                aria-label="Back to dashboard"
              >
                ← Back
              </button>
            ) : null}
          </div>
          <div className="dash-header-actions">
            <div className="dash-user-chip" title={user?.email ?? undefined}>
              <span className="dash-user-avatar">
                {(fullName ?? user?.email ?? 'U').slice(0, 1)}
              </span>
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
                useSkuStack
                  ? 'dash-modules dash-modules--with-sku-stack'
                  : 'dash-modules'
              }
              aria-label="Modules"
            >
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
              <p className="dash-modules-empty__title">No modules for this branch yet</p>
              <p>
                {effectiveBranch
                  ? `${effectiveBranch} dashboard cards are not set up yet.`
                  : 'Your account has no branch assigned.'}
              </p>
            </div>
          )
        ) : null}

        {activeModule === 'sku' && canAccess('sku') ? (
          <CatalogPanel branch={effectiveBranch} view="items" />
        ) : null}
        {activeModule === 'skuCustomersDiscount' && canAccess('sku') && effectiveBranch ? (
          <CustomersDiscountPanel branch={effectiveBranch} />
        ) : null}
        {activeModule === 'customerTransaction' && canAccess('customerTransaction') ? (
          <CustomerTransactionPanel
            company={customerTxCompany}
            branch={effectiveBranch}
            onClose={goHome}
            onCompanyChange={setCustomerTxCompany}
          />
        ) : null}
        {activeModule === 'routeTransactions' && canAccess('routeTransactions') ? (
          <RouteTransactionPanel
            option={routeTxOption}
            branch={effectiveBranch}
            onClose={goHome}
          />
        ) : null}
        {activeModule === 'skuPrintables' && canAccess('skuPrintables') ? (
          <SkuPrintablesPanel />
        ) : null}
        {activeModule === 'customerPrintables' && canAccess('customerPrintables') ? (
          <CustomerPrintablesPanel branch={effectiveBranch} />
        ) : null}
        {activeModule === 'fullGoodsReview' && canAccess('review') ? (
          <FullGoodsReviewPanel branch={effectiveBranch} mode="fullGoods" onClose={goHome} />
        ) : null}
        {activeModule === 'emptiesReview' && canAccess('review') ? (
          <FullGoodsReviewPanel branch={effectiveBranch} mode="empties" onClose={goHome} />
        ) : null}
        {activeModule === 'routePrintables' && canAccess('routePrintables') ? (
          <RoutePrintablesPanel branch={effectiveBranch} />
        ) : null}
        {activeModule === 'dslPrintables' && canAccess('dslPrintables') ? (
          <DslPrintablesPanel branch={effectiveBranch} />
        ) : null}
        {activeModule === 'dailySalesLiquidation' && canAccess('dailySalesLiquidation') ? (
          <DailySalesLiquidationPanel
            branch={effectiveBranch}
            company={dslCompany}
            onClose={goHome}
          />
        ) : null}
        {activeModule === 'actualInventory' && canAccess('actualInventory') ? (
          <ActualInventoryPanel
            branch={effectiveBranch}
            company={effectiveBranch === 'Nabunturan' ? actualInventoryCompany : null}
          />
        ) : null}
        {activeModule === 'inventory' && canAccess('inventory') ? (
          <InventoryPreviewPanel category={inventoryCategory} branch={effectiveBranch} />
        ) : null}
        {activeModule === 'collection' && canAccess('collection') ? (
          <CollectionPanel
            branch={effectiveBranch}
            option={collectionOption}
            onClose={goHome}
          />
        ) : null}
        {activeModule === 'factoryTransaction' && canAccess('factory') ? (
          <FactoryTransactionPanel category={factoryCategory} branch={effectiveBranch} />
        ) : null}
        {activeModule === 'ftPrintables' && canAccess('ftPrintables') ? (
          <FtPrintablesPanel />
        ) : null}
        {activeModule === 'fth' && canAccess('fth') ? <FthDiscountPanel /> : null}
        {activeModule === 'fullGoods' && canAccess('fullGoods') ? (
          <FullGoodsPanel mode="fullGoods" branch={effectiveBranch} onClose={goHome} />
        ) : null}
        {activeModule === 'fullGoodsDailyIn' && canAccess('fullGoodsDailyIn') ? (
          <FullGoodsPanel
            mode="fullGoods"
            branch={effectiveBranch}
            lockedMovementType="in"
            preferredCompany={dailyGoodsCompany}
            onClose={goHome}
          />
        ) : null}
        {activeModule === 'empties' && canAccess('empties') ? (
          <FullGoodsPanel mode="empties" branch={effectiveBranch} onClose={goHome} />
        ) : null}
        {activeModule === 'emptiesDailyIn' && canAccess('emptiesDailyIn') ? (
          <FullGoodsPanel
            mode="empties"
            branch={effectiveBranch}
            lockedMovementType="in"
            preferredCompany={dailyGoodsCompany}
            onClose={goHome}
          />
        ) : null}
        {activeModule === 'emptiesDailyOut' && canAccess('emptiesDailyOut') ? (
          <FullGoodsPanel
            mode="empties"
            branch={effectiveBranch}
            lockedMovementType="out"
            preferredCompany={dailyGoodsCompany}
            onClose={goHome}
          />
        ) : null}
        {activeModule === 'bo' && canAccess('bo') ? (
          <BoBadOrderPanel branch={effectiveBranch} />
        ) : null}
        {activeModule === 'fullsPrintables' && canAccess('fullsPrintables') ? (
          <FullsPrintablesPanel mode="fulls" branch={effectiveBranch} />
        ) : null}
        {activeModule === 'emptiesPrintables' && canAccess('emptiesPrintables') ? (
          <FullsPrintablesPanel mode="empties" branch={effectiveBranch} />
        ) : null}
        {activeModule === 'bLiquidationFulls' && canAccess('fullsPrintables') ? (
          <BLiquidationPrintablesPanel mode="fulls" branch={effectiveBranch} />
        ) : null}
        {activeModule === 'bLiquidationEmpties' && canAccess('emptiesPrintables') ? (
          <BLiquidationPrintablesPanel mode="empties" branch={effectiveBranch} />
        ) : null}
      </main>

      {user?.id ? (
        <DashboardChatPanel
          currentUserId={user.id}
          currentUserName={fullName ?? user.email ?? 'User'}
        />
      ) : null}

      <SkuOptionsPopover
        open={skuMenuOpen}
        top={skuMenuPos.top}
        left={skuMenuPos.left}
        onClose={() => setSkuMenuOpen(false)}
        onSelect={handleSkuOption}
      />

      <CustomerTransactionOptionsPopover
        open={customerTxMenuOpen}
        top={customerTxMenuPos.top}
        left={customerTxMenuPos.left}
        onClose={() => setCustomerTxMenuOpen(false)}
        onSelect={handleCustomerTxOption}
      />

      <RouteTransactionOptionsPopover
        open={routeTxMenuOpen}
        top={routeTxMenuPos.top}
        left={routeTxMenuPos.left}
        onClose={() => setRouteTxMenuOpen(false)}
        onSelect={handleRouteTxOption}
      />

      {dailyGoodsMenuKind ? (
        <DailyGoodsOptionsPopover
          open
          kind={dailyGoodsMenuKind}
          top={dailyGoodsMenuPos.top}
          left={dailyGoodsMenuPos.left}
          onClose={() => setDailyGoodsMenuKind(null)}
          onSelect={handleDailyGoodsOption}
        />
      ) : null}

      <ReviewOptionsPopover
        open={reviewMenuOpen}
        top={reviewMenuPos.top}
        left={reviewMenuPos.left}
        onClose={() => setReviewMenuOpen(false)}
        onSelect={handleReviewOption}
      />

      <ActualInventoryOptionsPopover
        open={actualInventoryMenuOpen}
        top={actualInventoryMenuPos.top}
        left={actualInventoryMenuPos.left}
        onClose={() => setActualInventoryMenuOpen(false)}
        onSelect={handleActualInventoryOption}
      />

      <InventoryOptionsPopover
        open={inventoryMenuOpen}
        top={inventoryMenuPos.top}
        left={inventoryMenuPos.left}
        onClose={() => setInventoryMenuOpen(false)}
        onSelect={handleInventoryMenuSelect}
      />

      <CollectionOptionsPopover
        open={collectionMenuOpen}
        top={collectionMenuPos.top}
        left={collectionMenuPos.left}
        onClose={() => setCollectionMenuOpen(false)}
        onSelect={handleCollectionOption}
      />

      <DslOptionsPopover
        open={dslMenuOpen}
        top={dslMenuPos.top}
        left={dslMenuPos.left}
        onClose={() => setDslMenuOpen(false)}
        onSelect={handleDslOption}
      />

      <PrintablesChooserModal
        open={printablesOpen}
        kind={printablesKind}
        top={printablesMenuPos.top}
        left={printablesMenuPos.left}
        onClose={() => setPrintablesOpen(false)}
        onSelect={handlePrintableSelect}
      />

      <FactoryTransactionChooserModal
        open={factoryOpen}
        top={factoryMenuPos.top}
        left={factoryMenuPos.left}
        onClose={() => setFactoryOpen(false)}
        onSelect={handleFactorySelect}
      />

      {isMasterAdmin ? (
        <AddUserModal open={addUserOpen} onClose={() => setAddUserOpen(false)} />
      ) : null}
    </div>
  )
}
