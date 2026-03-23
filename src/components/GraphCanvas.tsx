import { useEffect, useState, useRef } from 'react';

export default function GraphCanvas({ graphData, highlightIds }: { graphData: { nodes: any[], links: any[] } | null, highlightIds: Set<string> | null }) {
    const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        import('react-force-graph-2d').then(mod => setForceGraph2D(() => mod.default));
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const NODE_R = 4;
    const highlightNodes = highlightIds || new Set<string>();
    const isHighlighting = highlightNodes.size > 0;

    return (
        <div ref={containerRef} className="w-full h-full bg-gray-950 overflow-hidden relative">
            {(!ForceGraph2D || !graphData) ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400">Loading graph...</div>
            ) : dimensions.width > 0 && (
                <ForceGraph2D
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    nodeLabel={(node: any) => {
                        const skipKeys = ['id', 'label', 'x', 'y', 'vx', 'vy', 'index', 'color', 'fx', 'fy'];
                        let html = `<div class="p-1 max-w-xs break-words font-mono text-xs bg-gray-800 text-gray-200 rounded shadow-lg">`;
                        html += `<b>Type:</b> ${node.label || 'Unknown'}<br/>`;
                        html += `<b>ID:</b> ${node.id}`;
                        for (const key in node) {
                            if (!skipKeys.includes(key) && node[key] !== null && node[key] !== undefined) {
                                html += `<br/><b>${key}:</b> ${node[key]}`;
                            }
                        }
                        html += `</div>`;
                        return html;
                    }}
                    nodeId="id"
                    nodeColor={(node: any) => {
                        if (isHighlighting) {
                            return highlightNodes.has(node.id) ? '#3b82f6' : 'rgba(100, 100, 100, 0.2)';
                        }
                        return '#6b7280';
                    }}
                    nodeRelSize={NODE_R}
                    linkColor={(link: any) => {
                        if (isHighlighting) {
                            const sourceActive = highlightNodes.has(link.source.id || link.source);
                            const targetActive = highlightNodes.has(link.target.id || link.target);
                            return (sourceActive && targetActive) ? '#3b82f6' : 'rgba(100, 100, 100, 0.1)';
                        }
                        return 'rgba(200, 200, 200, 0.2)';
                    }}
                    linkWidth={(link: any) => {
                        if (isHighlighting) {
                            const sourceActive = highlightNodes.has(link.source.id || link.source);
                            const targetActive = highlightNodes.has(link.target.id || link.target);
                            return (sourceActive && targetActive) ? 2 : 1;
                        }
                        return 1;
                    }}
                    d3VelocityDecay={0.3} // Improve physics performance on many nodes
                    cooldownTicks={100} // Stop simulating fast to save CPU
                />
            )}
        </div>
    );
}
