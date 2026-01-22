import { useQuery } from '@tanstack/react-query'
import { api } from './client'

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
