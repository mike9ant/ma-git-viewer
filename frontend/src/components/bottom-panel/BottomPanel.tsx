/**
 * BottomPanel - Tabbed panel showing commit history or directory status.
 *
 * Tabs:
 * - History: Commit list for current path with contributor filtering
 * - Status: Directory statistics (file count, size, contributors)
 * - Contents: File content viewer (only for text files)
 *
 * History is the default and most-used tab. Clicking commits here
 * opens the DiffModal to view changes.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusTab } from './StatusTab'
import { HistoryTab } from './HistoryTab'
import { ContentsTab } from './ContentsTab'
import { Info, History, Folder, File, FileText } from 'lucide-react'
import { useSelectionStore } from '@/store/selectionStore'

// Text file extensions that should show the Contents tab
const TEXT_EXTENSIONS = new Set([
  // Source code
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'rs', 'py', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cc',
  'rb', 'php', 'swift', 'kt', 'scala', 'clj', 'cs', 'fs',
  'lua', 'vim', 'el', 'lisp', 'hs', 'ml', 'ex', 'exs', 'erl',
  // Web
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  // Data/Config
  'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'conf', 'cfg',
  // Docs
  'md', 'markdown', 'txt', 'rst', 'adoc', 'org',
  // Shell
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  // Other
  'sql', 'graphql', 'gql', 'prisma', 'proto',
  'dockerfile', 'makefile', 'cmake',
  'gitignore', 'gitattributes', 'editorconfig', 'env', 'envrc',
  'lock', 'sum',
])

function isTextFile(path: string): boolean {
  const name = path.split('/').pop() || ''
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const nameLower = name.toLowerCase()

  // Check extension
  if (TEXT_EXTENSIONS.has(ext)) return true

  // Check common extensionless files
  if (['makefile', 'dockerfile', 'gemfile', 'rakefile', 'procfile', 'brewfile'].includes(nameLower)) {
    return true
  }

  // Check dotfiles without extension
  if (name.startsWith('.') && !name.includes('.', 1)) {
    return true
  }

  return false
}

export function BottomPanel() {
  const { historyPath, currentPath, setHistoryPath } = useSelectionStore()
  const isFile = historyPath !== currentPath
  const showContentsTab = isFile && isTextFile(historyPath)

  return (
    <Tabs defaultValue="history" className="h-full flex flex-col">
      {/* Path indicator bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 text-xs">
        {isFile ? (
          <File className="h-3.5 w-3.5 text-gray-500" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-blue-500" />
        )}
        <span className="text-gray-600 truncate">
          {historyPath || 'Repository Root'}
        </span>
        {isFile && (
          <button
            onClick={() => setHistoryPath(currentPath)}
            className="ml-auto text-gray-400 hover:text-gray-600 text-xs"
          >
            Reset to directory
          </button>
        )}
      </div>
      <div className="border-b border-gray-200 px-2">
        <TabsList className="h-9 bg-transparent">
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="status" className="gap-1.5 text-xs">
            <Info className="h-3.5 w-3.5" />
            Status
          </TabsTrigger>
          {showContentsTab && (
            <TabsTrigger value="contents" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Contents
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
        <HistoryTab />
      </TabsContent>
      <TabsContent value="status" className="flex-1 m-0 overflow-hidden">
        <StatusTab />
      </TabsContent>
      {showContentsTab && (
        <TabsContent value="contents" className="flex-1 m-0 overflow-hidden">
          <ContentsTab />
        </TabsContent>
      )}
    </Tabs>
  )
}
