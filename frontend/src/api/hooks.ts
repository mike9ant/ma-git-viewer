/**
 * React Query hooks for server state management.
 *
 * Each hook wraps an API call with automatic caching, refetching, and cancellation.
 * Query keys include all parameters that affect the response, enabling proper
 * cache invalidation when dependencies change.
 *
 * Key hooks:
 * - useRepository(): Repo metadata for header
 * - useTree(): Directory listing for FileList
 * - useFullTree(): Complete tree for FileTree sidebar
 * - useCommits(): Commit history for HistoryTab
 * - useDiff(): Diff data for DiffViewer
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { useSelectionStore } from '@/store/selectionStore'

export function useRepository() {
  return useQuery({
    queryKey: ['repository'],
    queryFn: ({ signal }) => api.getRepository(signal),
  })
}

export function useTree(path?: string, includeLastCommit = true) {
  return useQuery({
    queryKey: ['tree', path, includeLastCommit],
    queryFn: ({ signal }) => api.getTree(path, includeLastCommit, signal),
  })
}

export function useFullTree() {
  return useQuery({
    queryKey: ['fullTree'],
    queryFn: ({ signal }) => api.getFullTree(signal),
  })
}

export function useFileContent(path: string | null) {
  return useQuery({
    queryKey: ['file', path],
    queryFn: ({ signal }) => api.getFileContent(path!, signal),
    enabled: !!path,
  })
}

export function useCommits(path?: string, limit = 50, offset = 0, excludeAuthors?: string[]) {
  return useQuery({
    queryKey: ['commits', path, limit, offset, excludeAuthors],
    queryFn: ({ signal }) => api.getCommits(path, limit, offset, excludeAuthors, signal),
  })
}

export function useDiff(toCommit: string | null, fromCommit?: string, path?: string, excludeAuthors?: string[]) {
  return useQuery({
    queryKey: ['diff', toCommit, fromCommit, path, excludeAuthors],
    queryFn: ({ signal }) => api.getDiff(toCommit!, fromCommit, path, excludeAuthors, signal),
    enabled: !!toCommit,
  })
}

export function useDirectoryInfo(path?: string) {
  return useQuery({
    queryKey: ['directoryInfo', path],
    queryFn: ({ signal }) => api.getDirectoryInfo(path, signal),
  })
}

export function useDirectoryListing(path?: string) {
  return useQuery({
    queryKey: ['directoryListing', path],
    queryFn: ({ signal }) => api.listDirectory(path, signal),
  })
}

export function useSwitchRepository() {
  const queryClient = useQueryClient()
  const resetSelection = useSelectionStore((state) => state.resetSelection)

  return useMutation({
    mutationFn: (path: string) => api.switchRepository(path),
    onSuccess: () => {
      resetSelection()
      // Invalidate all repository-related queries to force refetch
      queryClient.invalidateQueries({ queryKey: ['repository'] })
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['fullTree'] })
      queryClient.invalidateQueries({ queryKey: ['commits'] })
      queryClient.invalidateQueries({ queryKey: ['file'] })
      queryClient.invalidateQueries({ queryKey: ['directoryInfo'] })
    },
  })
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: ({ signal }) => api.getBranches(signal),
  })
}

export function useCheckoutBranch() {
  const queryClient = useQueryClient()
  const resetSelection = useSelectionStore((state) => state.resetSelection)

  return useMutation({
    mutationFn: (branch: string) => api.checkoutBranch(branch),
    onSuccess: () => {
      resetSelection()
      // Invalidate all queries since branch change affects everything
      queryClient.invalidateQueries({ queryKey: ['repository'] })
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['fullTree'] })
      queryClient.invalidateQueries({ queryKey: ['commits'] })
      queryClient.invalidateQueries({ queryKey: ['file'] })
      queryClient.invalidateQueries({ queryKey: ['directoryInfo'] })
      queryClient.invalidateQueries({ queryKey: ['diff'] })
    },
  })
}

export function useCheckoutRemoteBranch() {
  const queryClient = useQueryClient()
  const resetSelection = useSelectionStore((state) => state.resetSelection)

  return useMutation({
    mutationFn: ({ remoteBranch, localName }: { remoteBranch: string; localName: string }) =>
      api.checkoutRemoteBranch(remoteBranch, localName),
    onSuccess: () => {
      resetSelection()
      // Invalidate all queries since branch change affects everything
      queryClient.invalidateQueries({ queryKey: ['repository'] })
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['fullTree'] })
      queryClient.invalidateQueries({ queryKey: ['commits'] })
      queryClient.invalidateQueries({ queryKey: ['file'] })
      queryClient.invalidateQueries({ queryKey: ['directoryInfo'] })
      queryClient.invalidateQueries({ queryKey: ['diff'] })
    },
  })
}
