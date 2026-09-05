export const USER_BRANCHES = ['Maragusan', 'Nabunturan', 'Davao'] as const

export type UserBranch = (typeof USER_BRANCHES)[number]

export function isUserBranch(value: string): value is UserBranch {
  return (USER_BRANCHES as readonly string[]).includes(value)
}
