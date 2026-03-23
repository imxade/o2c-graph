import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Database, Bot } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string | null;
  records?: any[];
  llmInteractions?: { step: string; prompt: string; response: any }[];
}

interface ChatPanelProps {
  onHighlight: (ids: string[]) => void;
}

export default function ChatPanel({ onHighlight }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your O2C Assistant. Ask me anything about your Order-to-Cash data." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const query = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setLoading(true);

    try {
      // Lazy load RPCs and DB Client to prevent SSR Vercel compilation crashes
      const { generateSQLRpc, generateAnswerRpc } = await import('../server/query');
      const { queryClientRows } = await import('../lib/client-db');

      const sqlFn = generateSQLRpc as unknown as (input: { data: { question: string } }) => Promise<any>;
      const sqlData = await sqlFn({ data: { question: query } });
      const sql = sqlData.sql;

      let finalAnswer = "";
      let records: any[] = [];
      let llmInteractions = [sqlData.llmInteraction];
      let highlightIds: string[] = [];

      if (sql === 'GUARDRAIL_REJECT') {
        finalAnswer = "This system is designed to answer questions related to the provided dataset only.";
      } else {
        let executionError = null;
        try {
          records = await queryClientRows(sql);
        } catch (err: any) {
          executionError = err.message;
        }

        const queryContext = executionError ? [{ error: `SQL Execution Failed: ${executionError}` }] : records;

        // Local greedy node ID extractor to govern UI canvas bounds
        function extractIdsGreedily(recs: any[]): string[] {
          const ids = new Set<string>();
          function traverse(obj: any) {
            if (obj === null || obj === undefined) return;
            if (typeof obj === 'string' || typeof obj === 'number') ids.add(String(obj));
            else if (Array.isArray(obj)) obj.forEach(traverse);
            else if (typeof obj === 'object') Object.values(obj).forEach(traverse);
          }
          traverse(recs);
          return Array.from(ids);
        }

        highlightIds = extractIdsGreedily(records);

        const ansFn = generateAnswerRpc as unknown as (input: { data: { question: string, records: any[] } }) => Promise<any>;
        const ansData = await ansFn({ data: { question: query, records: queryContext } });

        finalAnswer = ansData.answer;
        llmInteractions.push(ansData.llmInteraction);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: finalAnswer,
        sql: sql !== 'GUARDRAIL_REJECT' ? sql : null,
        records: records,
        llmInteractions: llmInteractions
      }]);

      if (highlightIds.length > 0) {
        onHighlight(highlightIds);
      }

    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center space-x-2">
        <Bot className="w-5 h-5 text-blue-600" />
        <h2 className="font-semibold text-gray-800">O2C Assistant</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === 'assistant' && msg.sql && msg.sql !== 'GUARDRAIL_REJECT' && (
              <div className="mt-2 text-xs w-full">
                <details className="cursor-pointer text-gray-500 bg-gray-50 p-2 rounded border border-gray-200">
                  <summary className="flex items-center gap-1 font-mono"><Database className="w-3 h-3" /> View SQL Query</summary>
                  <pre className="mt-2 overflow-x-auto p-2 bg-gray-800 text-gray-300 rounded whitespace-pre-wrap">{msg.sql}</pre>
                </details>
              </div>
            )}
            {msg.role === 'assistant' && msg.records && msg.records.length > 0 && (
              <div className="mt-1 text-xs w-full">
                <details className="cursor-pointer text-gray-500 bg-gray-50 p-2 rounded border border-gray-200">
                  <summary className="flex items-center gap-1 font-mono hover:text-gray-700">View Raw Data ({msg.records.length} rows)</summary>
                  <pre className="mt-2 overflow-x-auto p-2 bg-gray-100 rounded text-[10px]">{JSON.stringify(msg.records.slice(0, 5), null, 2)}
                    {msg.records.length > 5 ? `\n... and ${msg.records.length - 5} more rows` : ''}</pre>
                </details>
              </div>
            )}
            {msg.role === 'assistant' && msg.llmInteractions && msg.llmInteractions.length > 0 && (
              <div className="mt-1 text-xs w-full">
                <details className="cursor-pointer text-gray-500 bg-gray-50 p-2 rounded border border-gray-200">
                  <summary className="flex items-center gap-1 font-mono hover:text-gray-700">View LLM Interactions</summary>
                  <div className="mt-2 space-y-4">
                    {msg.llmInteractions.map((interaction, i) => (
                      <div key={i} className="border-t border-gray-200 pt-2">
                        <h4 className="font-semibold text-gray-700">{interaction.step}</h4>
                        <div className="mt-1">
                          <span className="font-bold">Prompt:</span>
                          <pre className="overflow-x-auto p-2 bg-gray-100 rounded text-[10px] whitespace-pre-wrap">{interaction.prompt}</pre>
                        </div>
                        <div className="mt-1">
                          <span className="font-bold">Response:</span>
                          <pre className="overflow-x-auto p-2 bg-gray-100 rounded text-[10px] whitespace-pre-wrap">{JSON.stringify(interaction.response, null, 2)}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Analyzing query...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about orders, deliveries, invoices..."
            className="flex-1 rounded-full px-4 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-black"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
