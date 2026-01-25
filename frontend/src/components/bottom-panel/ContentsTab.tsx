/**
 * ContentsTab - File content viewer.
 *
 * Shows file contents in a scrollable monospace view for text files.
 * Markdown files can be rendered or shown as source.
 */

import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useFileContent } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Code, FileText } from 'lucide-react'

function isMarkdownFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext === 'md' || ext === 'markdown'
}

export function ContentsTab() {
  const { historyPath } = useSelectionStore()
  const { data: content, isLoading, error } = useFileContent(historyPath || null)
  const [showRendered, setShowRendered] = useState(true)

  const isMarkdown = historyPath ? isMarkdownFile(historyPath) : false

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Error loading file content
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No content available
      </div>
    )
  }

  // Render markdown
  if (isMarkdown && showRendered) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
          <Button
            variant={showRendered ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowRendered(true)}
            className="h-6 px-2 text-xs"
          >
            <FileText className="h-3 w-3 mr-1" />
            Rendered
          </Button>
          <Button
            variant={!showRendered ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowRendered(false)}
            className="h-6 px-2 text-xs"
          >
            <Code className="h-3 w-3 mr-1" />
            Source
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div
            className="p-4 prose prose-sm max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2"
            style={{
              '--tw-prose-pre-code': '#000',
              '--tw-prose-pre-bg': '#f3f4f6',
              '--tw-prose-code': '#000',
            } as React.CSSProperties}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </ScrollArea>
      </div>
    )
  }

  // Source code view
  const lines = content.split('\n')

  return (
    <div className="h-full flex flex-col">
      {isMarkdown && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
          <Button
            variant={showRendered ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowRendered(true)}
            className="h-6 px-2 text-xs"
          >
            <FileText className="h-3 w-3 mr-1" />
            Rendered
          </Button>
          <Button
            variant={!showRendered ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowRendered(false)}
            className="h-6 px-2 text-xs"
          >
            <Code className="h-3 w-3 mr-1" />
            Source
          </Button>
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="text-gray-400 text-right pr-3 pl-2 py-0 select-none w-10 border-r border-gray-200">
                    {index + 1}
                  </td>
                  <td className="pl-3 pr-2 py-0 whitespace-pre">
                    {line || '\u00A0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  )
}
