import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import GraphCanvas from '../components/GraphCanvas'
import ChatPanel from '../components/ChatPanel'

export const Route = createFileRoute('/')({
  component: App
})

function App() {
  const [highlightIds, setHighlightIds] = useState<Set<string> | null>(null);

  return (
    <main className="w-screen h-screen flex overflow-hidden">
      {/* Left Pane: Graph Viewer */}
      <div className="flex-1 relative bg-gray-950 h-full min-w-0">
        <GraphCanvas
          highlightIds={highlightIds}
        />
        {/* Floating Header */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h1 className="text-2xl font-bold text-white tracking-tight drop-shadow-md">
            O2C <span className="text-blue-400 font-medium">Knowledge Graph</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-sm drop-shadow">
            Interactive visualization of your SAP Order-to-Cash data pipeline.
          </p>
        </div>
      </div>

      {/* Right Pane: Chat Interface */}
      <div className="w-[450px] shadow-xl z-20 h-full shrink-0 flex flex-col">
        <ChatPanel onHighlight={(ids) => setHighlightIds(new Set(ids))} />
      </div>
    </main>
  )
}
