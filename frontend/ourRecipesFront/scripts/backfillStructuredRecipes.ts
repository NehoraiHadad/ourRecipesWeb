#!/usr/bin/env tsx
/**
 * Stage B3 backfill (docs/architecture/STRUCTURE_REFACTOR_TASKS.md): re-parses
 * every recipe's `raw_content` and refreshes the structured columns via the
 * same `recipeFieldsFromParsed` helper every live write path uses.
 *
 * Run locally against the Neon DB `.env.local`'s `DATABASE_URL` points at —
 * intentionally production; there is no separate backfill environment.
 * Touches ONLY: title, instructions, categories, difficulty,
 * preparation_time, is_parsed, parse_errors, ingredients_list. Never
 * raw_content, status, sync_*, images, or telegram_id.
 *
 * Defaults to a dry run — prints per-recipe planned changes and aggregate
 * counts. Pass --apply to actually write, in batches.
 *
 *   npm run backfill:structured
 *   npm run backfill:structured -- --apply
 */
import path from 'path';
import dotenv from 'dotenv';

// Must run before importing anything that reads DATABASE_URL at module load
// time (mirrors how `next dev`/`next build` pick up .env.local).
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  planRecipeBackfill,
  type BackfillPlan,
  type BackfillSourceRow
} from '../src/lib/recipes/backfillTransform';

const BATCH_SIZE = 25;

interface Counts {
  total: number;
  skippedBlank: number;
  willParseOk: number;
  becameParsed: number;
  becameUnparsed: number;
  ingredientsFilled: number;
}

function emptyCounts(): Counts {
  return { total: 0, skippedBlank: 0, willParseOk: 0, becameParsed: 0, becameUnparsed: 0, ingredientsFilled: 0 };
}

function tally(counts: Counts, plan: BackfillPlan | null): void {
  counts.total++;
  if (!plan) {
    counts.skippedBlank++;
    return;
  }
  if (plan.willBeParsed) counts.willParseOk++;
  if (!plan.wasParsed && plan.willBeParsed) counts.becameParsed++;
  if (plan.wasParsed && !plan.willBeParsed) counts.becameUnparsed++;
  if (plan.ingredientCount > 0) counts.ingredientsFilled++;
}

function describe(plan: BackfillPlan): string {
  const parsedChange =
    plan.wasParsed === plan.willBeParsed
      ? `parsed=${plan.willBeParsed}`
      : `parsed ${plan.wasParsed}->${plan.willBeParsed}`;
  return `  #${plan.id} (telegram_id=${plan.telegram_id}) ${parsedChange}, ingredients=${plan.ingredientCount}, title="${plan.fields.title ?? ''}"`;
}

function printSummary(apply: boolean, total: number, counts: Counts): void {
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${total} recipes loaded\n`);
  console.log('Summary:');
  console.log(`  total:               ${counts.total}`);
  console.log(`  skipped (blank):     ${counts.skippedBlank}`);
  console.log(`  will parse OK:       ${counts.willParseOk}`);
  console.log(`  false -> true:       ${counts.becameParsed}`);
  console.log(`  true -> false:       ${counts.becameUnparsed}`);
  console.log(`  ingredients filled:  ${counts.ingredientsFilled}`);
}

async function applyPlans(prisma: PrismaClient, plans: BackfillPlan[]): Promise<void> {
  console.log(`\nApplying ${plans.length} updates in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < plans.length; i += BATCH_SIZE) {
    const batch = plans.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((plan) => prisma.recipe.update({ where: { id: plan.id }, data: plan.fields })));
    console.log(`  ...${Math.min(i + BATCH_SIZE, plans.length)}/${plans.length}`);
  }
  console.log('Done.');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ['error'] });

  try {
    const rows = (await prisma.recipe.findMany({
      select: { id: true, telegram_id: true, raw_content: true, is_parsed: true }
    })) as BackfillSourceRow[];

    const counts = emptyCounts();
    const plans: BackfillPlan[] = [];

    for (const row of rows) {
      const plan = planRecipeBackfill(row);
      tally(counts, plan);
      if (plan) plans.push(plan);
    }

    for (const plan of plans) console.log(describe(plan));
    console.log('');
    printSummary(apply, rows.length, counts);

    if (!apply) {
      console.log('\nDry run only — pass --apply to write these changes.');
      return;
    }

    await applyPlans(prisma, plans);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
