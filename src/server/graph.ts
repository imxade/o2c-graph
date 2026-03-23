import { createServerFn } from '@tanstack/react-start';
import { queryRows } from '../lib/db';

export const getGraphData = createServerFn({ method: 'GET' })
    .handler(async () => {
        // Generate nodes and links with limits to prevent graph crash
        const [
            so, soi, odh, odi, bdh, bdi, je, pay, bp, prd, plt
        ] = await Promise.all([
            queryRows("SELECT DISTINCT salesOrder as id, 'sales_order' as label FROM sales_order_headers LIMIT 100"),
            queryRows("SELECT DISTINCT salesOrder || '_' || salesOrderItem as id, 'sales_order_item' as label, salesOrder, material FROM sales_order_items LIMIT 200"),
            queryRows("SELECT DISTINCT deliveryDocument as id, 'delivery' as label FROM outbound_delivery_headers LIMIT 100"),
            queryRows("SELECT DISTINCT deliveryDocument || '_' || deliveryDocumentItem as id, 'delivery_item' as label, deliveryDocument, referenceSdDocument, plant FROM outbound_delivery_items LIMIT 200"),
            queryRows("SELECT DISTINCT billingDocument as id, 'billing' as label FROM billing_document_headers LIMIT 100"),
            queryRows("SELECT DISTINCT billingDocument || '_' || billingDocumentItem as id, 'billing_item' as label, billingDocument, referenceSdDocument FROM billing_document_items LIMIT 200"),
            queryRows("SELECT DISTINCT accountingDocument as id, 'journal_entry' as label, referenceDocument FROM journal_entry_items_accounts_receivable LIMIT 100"),
            queryRows("SELECT DISTINCT accountingDocument as id, 'payment' as label, clearingAccountingDocument FROM payments_accounts_receivable LIMIT 100"),
            queryRows("SELECT DISTINCT businessPartner as id, 'business_partner' as label FROM business_partners LIMIT 50"),
            queryRows("SELECT DISTINCT product as id, 'product' as label FROM products LIMIT 50"),
            queryRows("SELECT DISTINCT plant as id, 'plant' as label FROM plants LIMIT 20")
        ]);

        const allNodes = [
            ...so, ...soi, ...odh, ...odi, ...bdh, ...bdi, ...je, ...pay, ...bp, ...prd, ...plt
        ];

        const seen = new Set<string>();
        const nodes = allNodes.filter(n => seen.has(n.id) ? false : (seen.add(n.id), true));
        const nodeIds = seen;

        const links: { source: string; target: string; label: string }[] = [];

        const addLink = (source: string, target: string, label: string) => {
            if (nodeIds.has(source) && nodeIds.has(target)) {
                links.push({ source, target, label });
            }
        };

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

        return { nodes, links };
    });
