import { supabase } from './supabase'
import type { Category, Product, Subcategory } from '../types/catalog'

/** Capitalize the first letter of each word (keeps spaces while typing). */
export function capitalizeFirst(value: string) {
  return value.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1))
}

function capitalizeName(value: string) {
  return capitalizeFirst(value).trim()
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

export async function addProduct(subcategoryId: string, name: string, price: number) {
  const { data, error } = await supabase
    .from('products')
    .insert({ subcategory_id: subcategoryId, name: capitalizeName(name), price })
    .select('id, subcategory_id, name, price, created_at')
    .single()

  return { data: data as Product | null, error: mapError(error) }
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  return { error: mapError(error) }
}

export async function updateProduct(id: string, name: string, price: number) {
  const trimmed = capitalizeName(name)
  if (!trimmed) return { data: null as Product | null, error: 'Product name is required.' }
  if (!Number.isFinite(price) || price < 0) {
    return { data: null as Product | null, error: 'Enter a valid price.' }
  }

  const { data, error } = await supabase
    .from('products')
    .update({ name: trimmed, price })
    .eq('id', id)
    .select('id, subcategory_id, name, price, created_at')
    .single()

  return { data: data as Product | null, error: mapError(error) }
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

export async function listCatalogTree() {
  const categoriesResult = await listCategories()
  if (categoriesResult.missingTable || categoriesResult.error) {
    return {
      data: [] as CatalogTreeCategory[],
      error: categoriesResult.error,
      missingTable: categoriesResult.missingTable,
    }
  }

  const [subsResult, productsResult] = await Promise.all([listAllSubcategories(), listAllProducts()])
  if (subsResult.missingTable || productsResult.missingTable) {
    return {
      data: [] as CatalogTreeCategory[],
      error: subsResult.error ?? productsResult.error,
      missingTable: true,
    }
  }
  if (subsResult.error || productsResult.error) {
    return {
      data: [] as CatalogTreeCategory[],
      error: subsResult.error ?? productsResult.error,
      missingTable: false,
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
          .map((product) => ({
            ...product,
            name: capitalizeName(product.name),
          })),
      })),
  }))

  return { data, error: null as string | null, missingTable: false }
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(price)
}
