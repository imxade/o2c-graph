import { createRequire } from 'module';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

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
    'sales_order_schedule_lines',
];

let db: any = null;
let initPromise: Promise<void> | null = null;

export async function initDB() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const require = createRequire(import.meta.url);

        // Use the async Node.js bundle (pure WASM, no native binary)
        const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node.cjs');

        // Resolve WASM binary from node_modules
        const wasmPath = resolve(
            require.resolve('@duckdb/duckdb-wasm/dist/duckdb-node.cjs'),
            '../duckdb-mvp.wasm',
        );

        const logger = new duckdb.VoidLogger();
        const worker = new duckdb.NodeJSConnector();
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(wasmPath);

        // Data root: works locally (process.cwd() = project root) and on Vercel
        const dataRoot = join(process.cwd(), 'sap-o2c-data');

        // Register every JSONL file in DuckDB's virtual filesystem and build views
        const conn = await db.connect();
        await conn.query('INSTALL json; LOAD json;');

        for (const table of TABLES) {
            const tableDir = join(dataRoot, table);
            if (!existsSync(tableDir)) continue;

            const jsonlFiles = readdirSync(tableDir).filter((f) => f.endsWith('.jsonl'));
            if (jsonlFiles.length === 0) continue;

            // Register each file as a virtual buffer: "tablename/filename.jsonl"
            const vfsPaths: string[] = [];
            for (const file of jsonlFiles) {
                const vfsName = `${table}/${file}`;
                const data = readFileSync(join(tableDir, file));
                await db.registerFileBuffer(vfsName, new Uint8Array(data));
                vfsPaths.push(`'${vfsName}'`);
            }

            // CREATE VIEW using array-of-paths syntax
            const pathList = vfsPaths.join(', ');
            await conn.query(
                `CREATE VIEW ${table} AS SELECT * FROM read_json_auto([${pathList}], ignore_errors=true)`,
            );
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
    if (typeof obj === 'bigint') return Number(obj);
    if (typeof obj === 'function' || typeof obj === 'symbol') return obj.toString();
    if (obj instanceof Date) return obj.toISOString();
    if (typeof obj === 'object') {
        if (Array.isArray(obj)) return obj.map(sanitizeForSerialization);
        if (ArrayBuffer.isView(obj)) return 'BinaryData';
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitizeForSerialization(value);
        }
        return result;
    }
    return obj;
}

export async function queryRows(sql: string) {
    await initDB();
    const conn = await db.connect();
    // duckdb-wasm returns an Apache Arrow Table
    const arrowTable = await conn.query(sql);
    // Convert Arrow rows to plain JS objects
    const rows = arrowTable.toArray().map((row: any) => {
        const obj: any = {};
        for (const field of arrowTable.schema.fields) {
            obj[field.name] = row[field.name];
        }
        return obj;
    });
    return sanitizeForSerialization(rows);
}
