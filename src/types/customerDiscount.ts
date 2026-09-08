export type CustomerDiscountGroup = {
  id: string
  branch: string
  name: string
  created_at: string
}

export type CustomerDiscount = {
  id: string
  group_id: string
  product_id: string
  discount: number
  created_at: string
  updated_at: string
}
