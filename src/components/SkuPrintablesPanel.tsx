import { PrintablesRecordsPanel } from './FullsPrintablesPanel'
import './FullGoodsPanel.css'
import './PrintablesPanel.css'
import './FullsPrintablesPanel.css'

export function SkuPrintablesPanel() {
  return (
    <PrintablesRecordsPanel mode="fulls" title="SKU Printables" printLayout="sku" />
  )
}
