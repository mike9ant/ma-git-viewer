/**
 * BranchSwitcher - Dropdown to view and switch git branches.
 *
 * Displays a clickable branch name that opens a popover with:
 * - Local branches listed first (flat list)
 * - Remote branches in a tree structure grouped by remote/path
 *
 * Clicking a local branch checks it out directly.
 * Clicking a remote branch opens a dialog to create a local tracking branch.
 */

import * as React from 'react'
import { GitBranch, Check, Loader2, ChevronRight, ChevronDown, FolderGit, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { useBranches, useCheckoutBranch, useCheckoutRemoteBranch, useRepository } from '@/api/hooks'
import { cn } from '@/lib/utils'
import type { BranchInfo } from '@/api/types'

/**
 * Filter branches by search query (case-insensitive substring match)
 */
function filterBranches(branches: BranchInfo[], query: string): BranchInfo[] {
  if (!query.trim()) return branches
  const normalized = query.toLowerCase().trim()
  return branches.filter(branch =>
    branch.name.toLowerCase().includes(normalized)
  )
}

interface TreeNode {
  name: string
  fullPath?: string // Only set for leaf nodes (actual branches)
  branch?: BranchInfo
  children: TreeNode[]
}

/**
 * Build a tree from remote branch names.
 * Collapses single-child paths into one node.
 */
function buildRemoteTree(branches: BranchInfo[]): TreeNode[] {
  const root: TreeNode = { name: '', children: [] }

  for (const branch of branches) {
    const parts = branch.name.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      let child = current.children.find((c) => c.name === part && !c.fullPath)

      if (!child) {
        child = {
          name: part,
          fullPath: isLast ? branch.name : undefined,
          branch: isLast ? branch : undefined,
          children: [],
        }
        current.children.push(child)
      }

      if (isLast) {
        child.fullPath = branch.name
        child.branch = branch
      }

      current = child
    }
  }

  // Collapse single-child paths
  function collapse(node: TreeNode): TreeNode {
    // First, recursively collapse children
    node.children = node.children.map(collapse)

    // If this node has exactly one child and is not a leaf (no branch)
    // and the child is also not a leaf, merge them
    while (
      node.children.length === 1 &&
      !node.fullPath &&
      node.children[0].children.length > 0 &&
      !node.children[0].fullPath
    ) {
      const child = node.children[0]
      node.name = node.name ? `${node.name}/${child.name}` : child.name
      node.children = child.children
    }

    // Sort children: folders first, then alphabetically
    node.children.sort((a, b) => {
      const aIsFolder = a.children.length > 0 && !a.fullPath
      const bIsFolder = b.children.length > 0 && !b.fullPath
      if (aIsFolder && !bIsFolder) return -1
      if (!aIsFolder && bIsFolder) return 1
      return a.name.localeCompare(b.name)
    })

    return node
  }

  collapse(root)
  return root.children
}

/**
 * Extract suggested local branch name from remote branch.
 * e.g., "origin/feature/foo" -> "feature/foo"
 */
function suggestLocalName(remoteBranch: string): string {
  const parts = remoteBranch.split('/')
  // Remove the remote name (first part, e.g., "origin")
  if (parts.length > 1) {
    return parts.slice(1).join('/')
  }
  return remoteBranch
}

interface RemoteTreeNodeProps {
  node: TreeNode
  depth: number
  onSelectRemote: (branch: BranchInfo) => void
  disabled: boolean
}

function RemoteTreeNode({ node, depth, onSelectRemote, disabled }: RemoteTreeNodeProps) {
  const [expanded, setExpanded] = React.useState(depth < 2)
  const isFolder = node.children.length > 0 && !node.fullPath
  const isBranch = !!node.fullPath

  if (isBranch && node.branch) {
    return (
      <button
        onClick={() => onSelectRemote(node.branch!)}
        disabled={disabled}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-left"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <GitBranch className="h-4 w-4 flex-shrink-0 text-gray-400" />
        <span className="truncate flex-1">{node.name}</span>
      </button>
    )
  }

  if (isFolder) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-100 text-left text-gray-600"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 flex-shrink-0" />
          )}
          <FolderGit className="h-4 w-4 flex-shrink-0 text-orange-400" />
          <span className="truncate">{node.name}/</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child, i) => (
              <RemoteTreeNode
                key={child.fullPath || `${node.name}-${child.name}-${i}`}
                node={child}
                depth={depth + 1}
                onSelectRemote={onSelectRemote}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}

export function BranchSwitcher() {
  const [open, setOpen] = React.useState(false)
  const [checkoutDialogOpen, setCheckoutDialogOpen] = React.useState(false)
  const [selectedRemote, setSelectedRemote] = React.useState<BranchInfo | null>(null)
  const [localName, setLocalName] = React.useState('')
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const { data: repo } = useRepository()
  const { data: branches, isLoading } = useBranches()
  const checkout = useCheckoutBranch()
  const checkoutRemote = useCheckoutRemoteBranch()

  // Clear checkout error and search when popover closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery('')
      checkout.reset()
    }
  }, [open])

  // Auto-focus search input when popover opens
  React.useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }, [open])

  const localBranches = React.useMemo(
    () => branches?.filter((b) => !b.is_remote) ?? [],
    [branches]
  )

  const remoteBranches = React.useMemo(
    () => branches?.filter((b) => b.is_remote) ?? [],
    [branches]
  )

  const filteredLocalBranches = React.useMemo(
    () => filterBranches(localBranches, searchQuery),
    [localBranches, searchQuery]
  )

  const filteredRemoteBranches = React.useMemo(
    () => filterBranches(remoteBranches, searchQuery),
    [remoteBranches, searchQuery]
  )

  const remoteTree = React.useMemo(
    () => buildRemoteTree(filteredRemoteBranches),
    [filteredRemoteBranches]
  )

  const handleLocalBranchClick = (branchName: string) => {
    if (branchName === repo?.head_branch) {
      setOpen(false)
      return
    }

    checkout.mutate(branchName, {
      onSuccess: () => {
        setOpen(false)
      },
    })
  }

  const handleRemoteBranchClick = (branch: BranchInfo) => {
    setSelectedRemote(branch)
    setLocalName(suggestLocalName(branch.name))
    setCheckoutError(null)
    setCheckoutDialogOpen(true)
  }

  const handleCheckoutRemote = () => {
    if (!selectedRemote || !localName.trim()) return

    setCheckoutError(null)
    checkoutRemote.mutate(
      { remoteBranch: selectedRemote.name, localName: localName.trim() },
      {
        onSuccess: () => {
          setCheckoutDialogOpen(false)
          setOpen(false)
          setSelectedRemote(null)
          setLocalName('')
        },
        onError: (error) => {
          setCheckoutError(error.message)
        },
      }
    )
  }

  const handleDialogClose = () => {
    if (!checkoutRemote.isPending) {
      setCheckoutDialogOpen(false)
      setSelectedRemote(null)
      setLocalName('')
      setCheckoutError(null)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (searchQuery) {
        setSearchQuery('')
      } else {
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      if (searchQuery) {
        setSearchQuery('')
        e.stopPropagation()
      }
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-0 px-1 text-xs text-gray-500 hover:text-gray-700 font-normal"
          >
            <GitBranch className="h-3 w-3 mr-1" />
            {repo?.head_branch || 'detached'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Switch Branch</h4>

            <div className="mb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search branches..."
                  className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={handleSearchKeyDown}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <ScrollArea className="h-96">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Local branches */}
                  {filteredLocalBranches.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 px-2 py-1">
                        Local
                      </div>
                      <div className="space-y-0.5">
                        {filteredLocalBranches.map((branch) => (
                          <button
                            key={branch.name}
                            onClick={() => handleLocalBranchClick(branch.name)}
                            disabled={checkout.isPending}
                            className={cn(
                              'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-left',
                              branch.is_current && 'bg-blue-50 text-blue-700 font-medium'
                            )}
                          >
                            <GitBranch className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate flex-1">{branch.name}</span>
                            {branch.is_current && (
                              <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Remote branches */}
                  {remoteTree.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 px-2 py-1">
                        Remote
                      </div>
                      <div className="space-y-0.5">
                        {searchQuery ? (
                          // Flat list when searching
                          filteredRemoteBranches.map((branch) => (
                            <button
                              key={branch.name}
                              onClick={() => handleRemoteBranchClick(branch)}
                              disabled={checkout.isPending || checkoutRemote.isPending}
                              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-left"
                            >
                              <GitBranch className="h-4 w-4 flex-shrink-0 text-gray-400" />
                              <span className="truncate flex-1">{branch.name}</span>
                            </button>
                          ))
                        ) : (
                          // Tree structure when not searching
                          remoteTree.map((node, i) => (
                            <RemoteTreeNode
                              key={node.fullPath || `root-${node.name}-${i}`}
                              node={node}
                              depth={0}
                              onSelectRemote={handleRemoteBranchClick}
                              disabled={checkout.isPending || checkoutRemote.isPending}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {filteredLocalBranches.length === 0 && remoteTree.length === 0 && (
                    <div className="text-sm text-gray-500 py-4 text-center">
                      {searchQuery
                        ? `No branches match "${searchQuery}"`
                        : 'No branches found'
                      }
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {checkout.isPending && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Switching branch...
              </div>
            )}

            {checkout.isError && (
              <div className="text-sm text-red-500">
                Failed to switch: {checkout.error?.message}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Remote checkout dialog */}
      <Dialog open={checkoutDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Checkout Remote Branch</DialogTitle>
            <DialogDescription>
              Create a local branch tracking <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{selectedRemote?.name}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700">Local branch name</label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter local branch name"
                disabled={checkoutRemote.isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && localName.trim()) {
                    handleCheckoutRemote()
                  }
                }}
              />
            </div>

            {checkoutError && (
              <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">
                {checkoutError}
              </div>
            )}

            {checkoutRemote.isPending && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating branch and checking out...
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleDialogClose}
              disabled={checkoutRemote.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCheckoutRemote}
              disabled={!localName.trim() || checkoutRemote.isPending}
            >
              {checkoutRemote.isPending ? 'Checking out...' : 'Checkout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
