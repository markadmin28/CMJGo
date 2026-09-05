export type FullGoodsMovementType = 'in' | 'out'

export type FullGoodsLocation = {
  id: string
  name: string
  created_at: string
}

export type FullGoodsMovement = {
  id: string
  movement_type: FullGoodsMovementType
  movement_date: string
  truck_number: string
  load_number: string
  location: string
  location_id: string | null
  category_id: string | null
  category_name: string | null
  brand_id: string | null
  brand_name: string | null
  created_at: string
  items?: FullGoodsItem[]
}

export type FullGoodsItem = {
  id: string
  movement_id: string
  product_id: string | null
  product_name: string
  brand_id: string | null
  brand_name: string | null
  quantity: number
  created_at: string
}

export type FullGoodsInput = {
  movement_type: FullGoodsMovementType
  movement_date: string
  truck_number: string
  load_number: string
  location: string
  location_id: string | null
  category_id: string
  category_name: string
  items: Array<{
    product_id: string
    product_name: string
    brand_id: string | null
    brand_name: string
    quantity: number
  }>
}
