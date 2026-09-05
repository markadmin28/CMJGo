import { useMemo, useState } from 'react'
import {
  parseBoAccLeafId,
  parseBoInOutLeafId,
  parseBoInvLeafId,
} from '../lib/boBadOrder'
import { BoAccInventoryPanel } from './BoAccInventoryPanel'
import { BoInOutForm } from './BoInOutForm'
import { BoInventoryPanel } from './BoInventoryPanel'
import './BoBadOrderPanel.css'

type TreeLeaf = {
  id: string
  label: string
  kind: 'leaf'
}

type TreeFolder = {
  id: string
  label: string
  kind: 'folder'
  children: Array<TreeFolder | TreeLeaf>
}

const BO_TREE: TreeFolder[] = [
  {
    id: 'bo-in-out',
    label: 'BO - IN/OUT',
    kind: 'folder',
    children: [
      {
        id: 'bo-pc',
        label: 'PC',
        kind: 'folder',
        children: [
          { id: 'bo-pc-in', label: 'BO - PC in', kind: 'leaf' },
          { id: 'bo-pc-out', label: 'BO - PC out', kind: 'leaf' },
        ],
      },
      {
        id: 'bo-smc',
        label: 'SMC',
        kind: 'folder',
        children: [
          { id: 'bo-smc-in', label: 'BO - SMC in', kind: 'leaf' },
          { id: 'bo-smc-out', label: 'BO - SMC out', kind: 'leaf' },
        ],
      },
      {
        id: 'bo-magnolia',
        label: 'MAGNOLIA',
        kind: 'folder',
        children: [
          { id: 'bo-magnolia-in', label: 'BO - MAGNOLIA in', kind: 'leaf' },
          { id: 'bo-magnolia-out', label: 'BO - MAGNOLIA out', kind: 'leaf' },
        ],
      },
    ],
  },
  {
    id: 'bo-acc-inventory',
    label: 'BO - ACC INVENTORY',
    kind: 'folder',
    children: [
      { id: 'ai-bo-pc', label: 'AI - BO PC', kind: 'leaf' },
      { id: 'ai-bo-smc', label: 'AI - BO SMC', kind: 'leaf' },
      { id: 'ai-bo-magnolia', label: 'AI - BO MAGNOLIA', kind: 'leaf' },
    ],
  },
  {
    id: 'bo-inventory',
    label: 'BO - INVENTORY',
    kind: 'folder',
    children: [
      { id: 'inv-bo-pc', label: 'INV. BO - PC', kind: 'leaf' },
      { id: 'inv-bo-smc', label: 'INV. BO - SMC', kind: 'leaf' },
      { id: 'inv-bo-magnolia', label: 'INV. BO - MAGNOLIA', kind: 'leaf' },
    ],
  },
]

function collectFolderIds(nodes: Array<TreeFolder | TreeLeaf>): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.kind !== 'folder') continue
    ids.push(node.id)
    ids.push(...collectFolderIds(node.children))
  }
  return ids
}

function findNodeLabel(nodes: Array<TreeFolder | TreeLeaf>, id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.label
    if (node.kind === 'folder') {
      const found = findNodeLabel(node.children, id)
      if (found) return found
    }
  }
  return null
}

function FolderIcon() {
  return (
    <svg className="bo-tree__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="#f5c542"
        stroke="#c4921a"
        strokeWidth="0.8"
        d="M1.5 3.5h4.2l1.3 1.4H14.5v8.1H1.5z"
      />
      <path fill="#ffe08a" d="M1.5 5.2h13v7.4H1.5z" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg className="bo-tree__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="#4b5563"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M5.2 8.4l4.1-4.1a2.1 2.1 0 013 3L7.4 12.2a3 3 0 11-4.2-4.2l4.8-4.8"
      />
    </svg>
  )
}

type TreeNodeProps = {
  node: TreeFolder | TreeLeaf
  depth: number
  selectedId: string
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

function TreeNode({ node, depth, selectedId, expanded, onToggle, onSelect }: TreeNodeProps) {
  if (node.kind === 'leaf') {
    return (
      <button
        type="button"
        className={
          selectedId === node.id
            ? 'bo-tree__item bo-tree__item--leaf is-selected'
            : 'bo-tree__item bo-tree__item--leaf'
        }
        style={{ paddingLeft: `${0.55 + depth * 0.85}rem` }}
        onClick={() => onSelect(node.id)}
      >
        <PaperclipIcon />
        <span>{node.label}</span>
      </button>
    )
  }

  const isOpen = expanded.has(node.id)

  return (
    <div className="bo-tree__branch">
      <div
        className={
          selectedId === node.id
            ? 'bo-tree__item bo-tree__item--folder is-selected'
            : 'bo-tree__item bo-tree__item--folder'
        }
        style={{ paddingLeft: `${0.55 + depth * 0.85}rem` }}
      >
        <button
          type="button"
          className={isOpen ? 'bo-tree__twist is-open' : 'bo-tree__twist'}
          aria-label={isOpen ? `Collapse ${node.label}` : `Expand ${node.label}`}
          aria-expanded={isOpen}
          onClick={() => onToggle(node.id)}
        />
        <button
          type="button"
          className="bo-tree__folder-btn"
          onClick={() => {
            onSelect(node.id)
            if (!isOpen) onToggle(node.id)
          }}
        >
          <FolderIcon />
          <span>{node.label}</span>
        </button>
      </div>
      {isOpen ? (
        <div className="bo-tree__children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function BoBadOrderPanel() {
  const allFolderIds = useMemo(() => collectFolderIds(BO_TREE), [])
  const [expanded, setExpanded] = useState(() => new Set(allFolderIds))
  const [selectedId, setSelectedId] = useState('bo-pc')
  const [activeFormId, setActiveFormId] = useState<string | null>(null)

  const selectedLabel = findNodeLabel(BO_TREE, selectedId) ?? 'Bad Order'
  const activeFormMeta = activeFormId ? parseBoInOutLeafId(activeFormId) : null
  const activeAccCompany = activeFormId ? parseBoAccLeafId(activeFormId) : null
  const activeInvCompany = activeFormId ? parseBoInvLeafId(activeFormId) : null

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSelect(id: string) {
    setSelectedId(id)
    if (parseBoInOutLeafId(id) || parseBoAccLeafId(id) || parseBoInvLeafId(id)) {
      setActiveFormId(id)
      return
    }
    setActiveFormId(null)
  }

  function closeActive() {
    const closedId = activeFormId
    setActiveFormId(null)
    if (!closedId) return
    if (parseBoInOutLeafId(closedId)) {
      setSelectedId(closedId.replace(/-(in|out)$/, '') || 'bo-pc')
      return
    }
    if (parseBoAccLeafId(closedId)) {
      setSelectedId('bo-acc-inventory')
      return
    }
    if (parseBoInvLeafId(closedId)) {
      setSelectedId('bo-inventory')
    }
  }

  if (activeFormMeta && activeFormId) {
    return (
      <BoInOutForm key={activeFormId} meta={activeFormMeta} onClose={closeActive} />
    )
  }

  if (activeAccCompany && activeFormId) {
    return (
      <BoAccInventoryPanel
        key={activeFormId}
        company={activeAccCompany}
        onClose={closeActive}
      />
    )
  }

  if (activeInvCompany && activeFormId) {
    return (
      <BoInventoryPanel
        key={activeFormId}
        company={activeInvCompany}
        onClose={closeActive}
      />
    )
  }

  return (
    <section className="bo-panel" aria-label="BO Bad Order">
      <aside className="bo-panel__sidebar">
        <div className="bo-tree" role="tree" aria-label="Bad Order options">
          {BO_TREE.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={toggleFolder}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </aside>
      <div className="bo-panel__main">
        <header className="bo-panel__main-head">
          <h1>{selectedLabel}</h1>
          <p>
            Open a leaf: BO In/Out for trips, AI - BO for month-end counts, or INV. BO for the
            inventory preview.
          </p>
        </header>
      </div>
    </section>
  )
}
