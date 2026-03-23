import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_next,
        mainWorker: eh_worker,
    },
};

let db: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<void> | null = null;

export async function initClientDB() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.VoidLogger(); // suppress verbose browser logs
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        const conn = await db.connect();
        await conn.query('INSTALL json; LOAD json;');

        // Import all JSONL files using Vite's glob import
        const jsonlFiles = import.meta.glob('../sap-o2c-data/**/*.jsonl', { query: '?url', import: 'default' });

        const tablesMap: Record<string, string[]> = {};

        for (const [path, resolver] of Object.entries(jsonlFiles)) {
            const url = await resolver() as string;
            const parts = path.split('/');
            const fileName = parts[parts.length - 1];
            const tableName = parts[parts.length - 2];

            // Fetch file and register globally into WASM memory
            const res = await fetch(url);
            const buffer = await res.arrayBuffer();
            const vfsName = `${tableName}_${fileName}`;
            await db.registerFileBuffer(vfsName, new Uint8Array(buffer));

            if (!tablesMap[tableName]) tablesMap[tableName] = [];
            tablesMap[tableName].push(`'${vfsName}'`);
        }

        for (const [tableName, files] of Object.entries(tablesMap)) {
            await conn.query(`CREATE VIEW ${tableName} AS SELECT * FROM read_json_auto([${files.join(', ')}], ignore_errors=true)`);
        }

        await conn.close();
    })();
    return initPromise;
}

export async function getClientDB() {
    await initClientDB();
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
        // Handle DuckDB Arrow Maps/Objects
        if (obj.toJSON) {
            return sanitizeForSerialization(obj.toJSON());
        }
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitizeForSerialization(value);
        }
        return result;
    }
    return obj;
}

export async function queryClientRows(sql: string) {
    await initClientDB();
    const conn = await db!.connect();
    const arrowTable = await conn.query(sql);

    // Explicitly parse Arrow into plain JS arrays and sanitize BigInts for React state updates
    const rawRows = arrowTable.toArray().map((r: any) => r.toJSON());
    const rows = sanitizeForSerialization(rawRows);

    await conn.close();
    return rows;
}
