export type FthRouteType = {
  id: string
  name: string
  created_at: string
}

export type FthDiscount = {
  id: string
  route_type_id: string
  product_id: string
  discount: number
  created_at: string
  updated_at: string
}
