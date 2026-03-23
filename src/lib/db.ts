import { createRequire } from 'module';

let db: any = null;
let initPromise: Promise<void> | null = null;

const TABLES = [
    'billing_document_cancellations',
    'billing_document_headers',
    'billing_document_items',
    'business_partner_addresses',
    'business_partners',
    'customer_company_assignments',
    'customer_sales_area_assignments',
    'journal_entry_items_accounts_receivable',
    'outbound_delivery_headers',
    'outbound_delivery_items',
    'payments_accounts_receivable',
    'plants',
    'product_descriptions',
    'product_plants',
    'product_storage_locations',
    'products',
    'sales_order_headers',
    'sales_order_items',
    'sales_order_schedule_lines'
];

export async function initDB() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const require = createRequire(import.meta.url);
        const duckLib = require(String('@duckdb/node-api'));
        db = await duckLib.DuckDBInstance.create(':memory:');
        const conn = await db.connect();

        // Load each JSONL directory as a view
        for (const table of TABLES) {
            const glob = `sap-o2c-data/${table}/*.jsonl`;
            const query = `CREATE VIEW ${table} AS SELECT * FROM read_json_auto('${glob}', ignore_errors=true);`;
            await conn.run(query);
        }
    })();
    return initPromise;
}

export async function getDB() {
    await initDB();
    return db!;
}

function sanitizeForSerialization(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') {
        return Number(obj);
    }
    if (typeof obj === 'function' || typeof obj === 'symbol') {
        return obj.toString();
    }
    if (obj instanceof Date) {
        return obj.toISOString();
    }
    if (typeof obj === 'object') {
        if (Array.isArray(obj)) {
            return obj.map(sanitizeForSerialization);
        }
        if (ArrayBuffer.isView(obj)) {
            return 'BinaryData';
        }
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitizeForSerialization(value);
        }
        return result;
    }
    return obj;
}

export async function queryRows(sql: string) {
    const database = await getDB();
    const conn = await database.connect();
    const result = await conn.runAndReadAll(sql);
    return sanitizeForSerialization(result.getRowObjectsJS());
}
