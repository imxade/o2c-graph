import { createServerFn } from '@tanstack/react-start';
import { generateSQL, generateAnswer } from '../lib/llm';
import { queryRows } from '../lib/db';

function extractIdsGreedily(records: any[]): string[] {
    const ids = new Set<string>();

    function traverse(obj: any) {
        if (obj === null || obj === undefined) return;
        if (typeof obj === 'string' || typeof obj === 'number') {
            ids.add(String(obj));
        } else if (Array.isArray(obj)) {
            obj.forEach(traverse);
        } else if (typeof obj === 'object') {
            Object.values(obj).forEach(traverse);
        }
    }

    traverse(records);
    return Array.from(ids);
}

export const executeQuery = createServerFn({ method: 'POST' })
    .handler(async (ctx: any) => {
        const { question } = ctx.data;

        if (!question) {
            throw new Error('Question is required');
        }

        // Step 1: SQL Generation
        const sqlGeneration = await generateSQL(question);
        const sql = sqlGeneration.sql;

        if (sql === 'GUARDRAIL_REJECT') {
            return {
                answer: "This system is designed to answer questions related to the provided dataset only.",
                rawSql: null,
                records: [],
                highlightIds: [],
                llmInteractions: [{ step: 'SQL Generation', prompt: sqlGeneration.rawPrompt, response: sqlGeneration.rawResponse }]
            };
        }

        // Step 2: Execute SQL
        let records: any[] = [];
        let executionError = null;
        try {
            records = await queryRows(sql);
        } catch (e: any) {
            executionError = e.message;
        }

        const queryContext = executionError
            ? [{ error: `SQL Execution Failed: ${executionError}` }]
            : records;

        const highlightIds = extractIdsGreedily(records);

        // Step 3: NL Answer Generation
        const answerGeneration = await generateAnswer(question, queryContext);

        return {
            answer: answerGeneration.answer,
            rawSql: sql,
            records: queryContext,
            highlightIds,
            llmInteractions: [
                { step: 'SQL Generation', prompt: sqlGeneration.rawPrompt, response: sqlGeneration.rawResponse },
                { step: 'Answer Generation', prompt: answerGeneration.rawPrompt, response: answerGeneration.rawResponse }
            ]
        };
    });
