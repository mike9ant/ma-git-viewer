import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { useSelectionStore } from '@/store/selectionStore'

export function useRepository() {
  return useQuery({
    queryKey: ['repository'],
    queryFn: api.getRepository,
  })
}

export function useTree(path?: string, includeLastCommit = true) {
  return useQuery({
    queryKey: ['tree', path, includeLastCommit],
    queryFn: () => api.getTree(path, includeLastCommit),
  })
}

export function useFullTree() {
  return useQuery({
    queryKey: ['fullTree'],
    queryFn: api.getFullTree,
  })
}

export function useFileContent(path: string | null) {
  return useQuery({
    queryKey: ['file', path],
    queryFn: () => api.getFileContent(path!),
    enabled: !!path,
  })
}

export function useCommits(path?: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['commits', path, limit, offset],
    queryFn: () => api.getCommits(path, limit, offset),
  })
}

export function useDiff(toCommit: string | null, fromCommit?: string, path?: string) {
  return useQuery({
    queryKey: ['diff', toCommit, fromCommit, path],
    queryFn: () => api.getDiff(toCommit!, fromCommit, path),
    enabled: !!toCommit,
  })
}

export function useDirectoryInfo(path?: string) {
  return useQuery({
    queryKey: ['directoryInfo', path],
    queryFn: () => api.getDirectoryInfo(path),
  })
}

export function useDirectoryListing(path?: string) {
  return useQuery({
    queryKey: ['directoryListing', path],
    queryFn: () => api.listDirectory(path),
  })
}

export function useSwitchRepository() {
  const queryClient = useQueryClient()
  const resetSelection = useSelectionStore((state) => state.resetSelection)

  return useMutation({
    mutationFn: api.switchRepository,
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
