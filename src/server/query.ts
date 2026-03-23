import { createServerFn } from '@tanstack/react-start';
import { generateSQL, generateAnswer } from '../lib/llm';

export const generateSQLRpc = createServerFn({ method: 'POST' })
    .handler(async (ctx: any) => {
        const { question } = ctx.data;
        if (!question) throw new Error('Question is required');

        const sqlGeneration = await generateSQL(question);
        const sql = sqlGeneration.sql;

        return {
            sql: sql,
            rawSql: sql,
            llmInteraction: { step: 'SQL Generation', prompt: sqlGeneration.rawPrompt, response: sqlGeneration.rawResponse }
        };
    });

export const generateAnswerRpc = createServerFn({ method: 'POST' })
    .handler(async (ctx: any) => {
        const { question, records } = ctx.data;

        const answerGeneration = await generateAnswer(question, records);

        return {
            answer: answerGeneration.answer,
            llmInteraction: { step: 'Answer Generation', prompt: answerGeneration.rawPrompt, response: answerGeneration.rawResponse }
        };
    });
