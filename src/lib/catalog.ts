import { supabase } from './supabase'
import type { UserBranch } from './branches'
import type { Category, Product, Subcategory } from '../types/catalog'

/** Capitalize the first letter of each word (keeps spaces while typing). */
export function capitalizeFirst(value: string) {
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
}

function capitalizeName(value: string) {
  return capitalizeFirst(value).trim()
}

/** Branches that store overrides in product_branch_prices (Davao uses products.price). */
export function usesBranchPriceOverrides(branch: UserBranch | null | undefined) {
  return branch === 'Nabunturan'
}

/** Branches that pick which SKU products appear in TX / daily / printables modules. */
export function usesBranchTxVisibility(branch: UserBranch | null | undefined) {
  return branch === 'Nabunturan' || branch === 'Davao'
}

export function isMissingCatalogTable(error: { message?: string; code?: string } | null) {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST200' ||
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('could not find a relationship')
  )
}

function mapError(error: { message?: string; code?: string } | null) {
  if (!error) return null
  if (isMissingCatalogTable(error)) {
    return 'Catalog tables are not set up yet. Run the SQL in the setup card, then refresh.'
  }
  if ((error.message ?? '').toLowerCase().includes('duplicate')) {
    return 'That name already exists here.'
  }
  return error.message ?? 'Something went wrong.'
}

export async function listCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  return { data: (data ?? []) as Category[], error: mapError(error), missingTable: isMissingCatalogTable(error) }
}

export async function addCategory(name: string, createdBy?: string) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: capitalizeName(name), created_by: createdBy ?? null })
    .select('id, name, created_at')
    .single()

  return { data: data as Category | null, error: mapError(error) }
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  return { error: mapError(error) }
}

export async function updateCategory(id: string, name: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as Category | null, error: 'Category name is required.' }

  const { data, error } = await supabase
    .from('categories')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  return { data: data as Category | null, error: mapError(error) }
}

export async function listSubcategories(categoryId: string) {
  const { data, error } = await supabase
    .from('subcategories')
    .select('id, category_id, name, created_at')
    .eq('category_id', categoryId)
    .order('created_at', { ascending: true })

  return {
    data: (data ?? []) as Subcategory[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function addSubcategory(categoryId: string, name: string) {
  const { data, error } = await supabase
    .from('subcategories')
    .insert({ category_id: categoryId, name: capitalizeName(name) })
    .select('id, category_id, name, created_at')
    .single()

  return { data: data as Subcategory | null, error: mapError(error) }
}

export async function deleteSubcategory(id: string) {
  const { error } = await supabase.from('subcategories').delete().eq('id', id)
  return { error: mapError(error) }
}

export async function updateSubcategory(id: string, name: string) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as Subcategory | null, error: 'Brand name is required.' }

  const { data, error } = await supabase
    .from('subcategories')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id, category_id, name, created_at')
    .single()

  return { data: data as Subcategory | null, error: mapError(error) }
}

export async function listProducts(subcategoryId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('id, subcategory_id, name, price, created_at')
    .eq('subcategory_id', subcategoryId)
    .order('created_at', { ascending: true })

  return { data: (data ?? []) as Product[], error: mapError(error), missingTable: isMissingCatalogTable(error) }
}

export async function listBranchPrices(branch: UserBranch) {
  const { data, error } = await supabase
    .from('product_branch_prices')
    .select('product_id, branch, price, show_in_customer_tx')
    .eq('branch', branch)

  return {
    data: (data ?? []) as Array<{
      product_id: string
      branch: string
      price: number
      show_in_customer_tx?: boolean
    }>,
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function upsertBranchPrice(productId: string, branch: UserBranch, price: number) {
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Enter a valid price.', missingTable: false }
  }

  const { error } = await supabase.from('product_branch_prices').upsert(
    {
      product_id: productId,
      branch,
      price,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id,branch' },
  )

  return { error: mapError(error), missingTable: isMissingCatalogTable(error) }
}

/** Toggle whether a Nabunturan product appears in Customer Transaction. */
export async function setBranchProductTxEnabled(
  productId: string,
  branch: UserBranch,
  enabled: boolean,
  price: number,
) {
  const safePrice = Number.isFinite(price) && price >= 0 ? price : 0
  const { error } = await supabase.from('product_branch_prices').upsert(
    {
      product_id: productId,
      branch,
      price: safePrice,
      show_in_customer_tx: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id,branch' },
  )

  return { error: mapError(error), missingTable: isMissingCatalogTable(error) }
}

export async function addProduct(
  subcategoryId: string,
  name: string,
  price: number,
  branch?: UserBranch | null,
) {
  const { data, error } = await supabase
    .from('products')
    .insert({ subcategory_id: subcategoryId, name: capitalizeName(name), price })
    .select('id, subcategory_id, name, price, created_at')
    .single()

  if (error || !data) {
    return { data: null as Product | null, error: mapError(error), missingTable: isMissingCatalogTable(error) }
  }

  if (usesBranchPriceOverrides(branch)) {
    const branchResult = await upsertBranchPrice(data.id, branch!, price)
    if (branchResult.error) {
      return {
        data: data as Product,
        error: branchResult.error,
        missingTable: branchResult.missingTable,
      }
    }
    return { data: { ...data, price } as Product, error: null, missingTable: false }
  }

  return { data: data as Product | null, error: null, missingTable: false }
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return { error: mapError(error) }
}

export async function updateProduct(
  id: string,
  name: string,
  price: number,
  branch?: UserBranch | null,
) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as Product | null, error: 'Product name is required.' }
  if (!Number.isFinite(price) || price < 0) {
    return { data: null as Product | null, error: 'Enter a valid price.' }
  }

  if (usesBranchPriceOverrides(branch)) {
    const { data, error } = await supabase
      .from('products')
      .update({ name: trimmed })
      .eq('id', id)
      .select('id, subcategory_id, name, price, created_at')
      .single()

    if (error || !data) {
      return { data: null as Product | null, error: mapError(error), missingTable: isMissingCatalogTable(error) }
    }

    const branchResult = await upsertBranchPrice(id, branch!, price)
    if (branchResult.error) {
      return {
        data: null as Product | null,
        error: branchResult.error,
        missingTable: branchResult.missingTable,
      }
    }

    return {
      data: { ...data, name: trimmed, price } as Product,
      error: null,
      missingTable: false,
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update({ name: trimmed, price })
    .eq('id', id)
    .select('id, subcategory_id, name, price, created_at')
    .single()

  return {
    data: data as Product | null,
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function listAllSubcategories() {
  const { data, error } = await supabase
    .from('subcategories')
    .select('id, category_id, name, created_at')
    .order('created_at', { ascending: true })

  return {
    data: (data ?? []) as Subcategory[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export async function listAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, subcategory_id, name, price, created_at')
    .order('created_at', { ascending: true })

  return {
    data: (data ?? []) as Product[],
    error: mapError(error),
    missingTable: isMissingCatalogTable(error),
  }
}

export type CatalogTreeCategory = Category & {
  subcategories: Array<Subcategory & { products: Product[] }>
}

export type ListCatalogTreeOptions = {
  /** Only include products checked for this branch’s transactions. */
  forTransactions?: boolean
}

export async function listCatalogTree(
  branch?: UserBranch | null,
  options?: ListCatalogTreeOptions,
) {
  const categoriesResult = await listCategories()
  if (categoriesResult.missingTable || categoriesResult.error) {
    return {
      data: [] as CatalogTreeCategory[],
      error: categoriesResult.error,
      missingTable: categoriesResult.missingTable,
      missingBranchPrices: false,
    }
  }

  const [subsResult, productsResult] = await Promise.all([listAllSubcategories(), listAllProducts()])
  if (subsResult.missingTable || productsResult.missingTable) {
    return {
      data: [] as CatalogTreeCategory[],
      error: subsResult.error ?? productsResult.error,
      missingTable: true,
      missingBranchPrices: false,
    }
  }
  if (subsResult.error || productsResult.error) {
    return {
      data: [] as CatalogTreeCategory[],
      error: subsResult.error ?? productsResult.error,
      missingTable: false,
      missingBranchPrices: false,
    }
  }

  let priceByProductId = new Map<string, number>()
  let txEnabledByProductId = new Map<string, boolean>()
  let missingBranchPrices = false

  if (usesBranchPriceOverrides(branch) || usesBranchTxVisibility(branch)) {
    const branchPrices = await listBranchPrices(branch!)
    if (branchPrices.missingTable) {
      missingBranchPrices = usesBranchPriceOverrides(branch) || usesBranchTxVisibility(branch)
    } else if (branchPrices.error) {
      return {
        data: [] as CatalogTreeCategory[],
        error: branchPrices.error,
        missingTable: false,
        missingBranchPrices: false,
      }
    } else {
      if (usesBranchPriceOverrides(branch)) {
        priceByProductId = new Map(
          branchPrices.data.map((row) => [row.product_id, Number(row.price) || 0]),
        )
      }
      if (usesBranchTxVisibility(branch)) {
        txEnabledByProductId = new Map(
          branchPrices.data.map((row) => [row.product_id, Boolean(row.show_in_customer_tx)]),
        )
      }
    }
  }

  const data = categoriesResult.data.map((category) => ({
    ...category,
    name: capitalizeName(category.name),
    subcategories: subsResult.data
      .filter((sub) => sub.category_id === category.id)
      .map((sub) => ({
        ...sub,
        name: capitalizeName(sub.name),
        products: productsResult.data
          .filter((product) => product.subcategory_id === sub.id)
          .map((product) => {
            const branchPrice = priceByProductId.get(product.id)
            return {
              ...product,
              name: capitalizeName(product.name),
              // Nabunturan: show override when set, otherwise fall back to Davao price as starting value.
              price:
                usesBranchPriceOverrides(branch) && branchPrice != null
                  ? branchPrice
                  : Number(product.price) || 0,
              showInCustomerTx: usesBranchTxVisibility(branch)
                ? Boolean(txEnabledByProductId.get(product.id))
                : undefined,
            }
          })
          .filter((product) => {
            if (!options?.forTransactions || !usesBranchTxVisibility(branch)) return true
            // Until branch prices/TX table exists, don't hide the whole catalog.
            if (missingBranchPrices) return true
            return Boolean(product.showInCustomerTx)
          }),
      })),
  }))

  return {
    data,
    error: null as string | null,
    missingTable: false,
    missingBranchPrices,
  }
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(price)
}
