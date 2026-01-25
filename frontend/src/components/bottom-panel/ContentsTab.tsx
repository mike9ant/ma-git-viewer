/**
 * ContentsTab - File content viewer.
 *
 * Shows file contents in a scrollable monospace view for text files.
 * Only shown for text/source files under 100KB.
 */

import { useFileContent } from '@/api/hooks'
import { useSelectionStore } from '@/store/selectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ContentsTab() {
  const { historyPath } = useSelectionStore()
  const { data: content, isLoading, error } = useFileContent(historyPath || null)

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

  const lines = content.split('\n')

  return (
    <ScrollArea className="h-full">
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
  )
}
