import { isUserBranch, type UserBranch } from './branches'

/** Home dashboard card keys (not including printable chooser sub-options). */
export type DashboardCardId =
  | 'sku'
  | 'factory'
  | 'ftPrintables'
  | 'skuPrintables'
  | 'fullsPrintables'
  | 'emptiesPrintables'
  | 'actualInventory'
  | 'inventory'
  | 'fth'
  | 'fullGoods'
  | 'empties'
  | 'bo'

export const DAVAO_DASHBOARD_CARDS: readonly DashboardCardId[] = [
  'sku',
  'factory',
  'ftPrintables',
  'skuPrintables',
  'fullsPrintables',
  'emptiesPrintables',
  'actualInventory',
  'inventory',
  'fth',
  'fullGoods',
  'empties',
  'bo',
] as const

/** Print/report modules Maragusan users get when they open the Davao workspace. */
export const MARAGUSAN_DAVAO_WORKSPACE_CARDS: readonly DashboardCardId[] = [
  'ftPrintables',
  'skuPrintables',
  'fullsPrintables',
  'emptiesPrintables',
  'inventory',
] as const

const BRANCH_DASHBOARD_CARDS: Record<UserBranch, readonly DashboardCardId[]> = {
  Davao: DAVAO_DASHBOARD_CARDS,
  Maragusan: [],
  // Nabunturan modules (coming soon).
  Nabunturan: [],
}

/** Login branches that first choose a workspace card before modules. */
const BRANCH_PICKER_OPTIONS: Partial<Record<UserBranch, readonly UserBranch[]>> = {
  Maragusan: ['Nabunturan', 'Davao'],
}

type DashboardAccessOptions = {
  isMasterAdmin?: boolean
  /** Account login branch (used when opening another workspace via picker). */
  loginBranch?: UserBranch | null
}

export function getUserBranch(metadata: Record<string, unknown> | undefined | null) {
  const raw = metadata?.branch
  if (typeof raw !== 'string') return null
  return isUserBranch(raw) ? raw : null
}

export function usesBranchWorkspacePicker(branch: UserBranch | null) {
  if (!branch) return false
  return Boolean(BRANCH_PICKER_OPTIONS[branch]?.length)
}

export function getBranchWorkspaceOptions(branch: UserBranch | null) {
  if (!branch) return [] as UserBranch[]
  return [...(BRANCH_PICKER_OPTIONS[branch] ?? [])]
}

export function getDashboardCardsForBranch(
  workspaceBranch: UserBranch | null,
  options?: DashboardAccessOptions,
) {
  if (options?.isMasterAdmin) return [...DAVAO_DASHBOARD_CARDS]
  if (!workspaceBranch) return []

  if (options?.loginBranch === 'Maragusan' && workspaceBranch === 'Davao') {
    return [...MARAGUSAN_DAVAO_WORKSPACE_CARDS]
  }

  return [...(BRANCH_DASHBOARD_CARDS[workspaceBranch] ?? [])]
}

export function canAccessDashboardCard(
  cardId: DashboardCardId,
  workspaceBranch: UserBranch | null,
  options?: DashboardAccessOptions,
) {
  return getDashboardCardsForBranch(workspaceBranch, options).includes(cardId)
}
