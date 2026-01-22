import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusTab } from './StatusTab'
import { HistoryTab } from './HistoryTab'
import { Info, History } from 'lucide-react'

export function BottomPanel() {
  return (
    <Tabs defaultValue="history" className="h-full flex flex-col">
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
        </TabsList>
      </div>
      <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
        <HistoryTab />
      </TabsContent>
      <TabsContent value="status" className="flex-1 m-0 overflow-hidden">
        <StatusTab />
      </TabsContent>
    </Tabs>
  )
}
