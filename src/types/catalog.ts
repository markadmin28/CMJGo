export type Category = {
  id: string
  name: string
  created_at: string
}

export type Subcategory = {
  id: string
  category_id: string
  name: string
  created_at: string
}

export type Product = {
  id: string
  subcategory_id: string
  name: string
  price: number
  created_at: string
  /** When checked for this branch, product appears in transaction modules. */
  showInCustomerTx?: boolean
}
