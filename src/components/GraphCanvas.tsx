import { useEffect, useState, useRef } from 'react';
import { queryClientRows } from '../lib/client-db';

export default function GraphCanvas({ highlightIds }: { highlightIds: Set<string> | null }) {
    const [ForceGraph2D, setForceGraph2D] = useState<any>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] } | null>(null);
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

    useEffect(() => {
        async function loadGraphData() {
            const [
                so, soi, odh, odi, bdh, bdi, je, pay, bp, prd, plt
            ] = await Promise.all([
                queryClientRows("SELECT DISTINCT salesOrder as id, 'sales_order' as label FROM sales_order_headers LIMIT 100"),
                queryClientRows("SELECT DISTINCT salesOrder || '_' || salesOrderItem as id, 'sales_order_item' as label, salesOrder, material FROM sales_order_items LIMIT 200"),
                queryClientRows("SELECT DISTINCT deliveryDocument as id, 'delivery' as label FROM outbound_delivery_headers LIMIT 100"),
                queryClientRows("SELECT DISTINCT deliveryDocument || '_' || deliveryDocumentItem as id, 'delivery_item' as label, deliveryDocument, referenceSdDocument, plant FROM outbound_delivery_items LIMIT 200"),
                queryClientRows("SELECT DISTINCT billingDocument as id, 'billing' as label FROM billing_document_headers LIMIT 100"),
                queryClientRows("SELECT DISTINCT billingDocument || '_' || billingDocumentItem as id, 'billing_item' as label, billingDocument, referenceSdDocument FROM billing_document_items LIMIT 200"),
                queryClientRows("SELECT DISTINCT accountingDocument as id, 'journal_entry' as label, referenceDocument FROM journal_entry_items_accounts_receivable LIMIT 100"),
                queryClientRows("SELECT DISTINCT accountingDocument as id, 'payment' as label, clearingAccountingDocument FROM payments_accounts_receivable LIMIT 100"),
                queryClientRows("SELECT DISTINCT businessPartner as id, 'business_partner' as label FROM business_partners LIMIT 50"),
                queryClientRows("SELECT DISTINCT product as id, 'product' as label FROM products LIMIT 50"),
                queryClientRows("SELECT DISTINCT plant as id, 'plant' as label FROM plants LIMIT 20")
            ]);

            const allNodes = [...so, ...soi, ...odh, ...odi, ...bdh, ...bdi, ...je, ...pay, ...bp, ...prd, ...plt];
            const seen = new Set<string>();
            const nodes = allNodes.filter(n => seen.has(n.id) ? false : (seen.add(n.id), true));
            const nodeIds = seen;
            const links: { source: string; target: string; label: string }[] = [];
            const addLink = (source: string, target: string, label: string) => { if (nodeIds.has(source) && nodeIds.has(target)) links.push({ source, target, label }); };

            soi.forEach((item: any) => {
                addLink(item.salesOrder, item.id, 'has_item');
                if (item.material) addLink(item.id, item.material, 'material');
            });
            odi.forEach((item: any) => {
                addLink(item.deliveryDocument, item.id, 'has_item');
                if (item.referenceSdDocument) addLink(item.id, item.referenceSdDocument, 'referenceSdDocument');
                if (item.plant) addLink(item.id, item.plant, 'plant');
            });
            bdi.forEach((item: any) => {
                addLink(item.billingDocument, item.id, 'has_item');
                if (item.referenceSdDocument) addLink(item.id, item.referenceSdDocument, 'referenceSdDocument');
            });
            je.forEach((item: any) => {
                if (item.referenceDocument) addLink(item.id, item.referenceDocument, 'referenceDocument');
            });
            pay.forEach((item: any) => {
                if (item.clearingAccountingDocument) addLink(item.id, item.clearingAccountingDocument, 'clearingDoc');
            });

            setGraphData({ nodes, links });
        }
        loadGraphData().catch(err => console.error('Failed to load local DB graph:', err));
    }, []);

    const NODE_R = 4;
    const highlightNodes = highlightIds || new Set<string>();
    const isHighlighting = highlightNodes.size > 0;

    return (
        <div ref={containerRef} className="w-full h-full bg-gray-950 overflow-hidden relative">
            {(!ForceGraph2D || !graphData) ? (
                <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-gray-900 text-gray-400">
                    <span className="text-sm font-mono animate-pulse text-blue-400">Initializing Local DuckDB WASM Engine...</span>
                    <span>Loading semantic context nodes...</span>
                </div>
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
                    d3VelocityDecay={0.3}
                    cooldownTicks={100}
                />
            )}
        </div>
    );
}
