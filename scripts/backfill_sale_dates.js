/*
  backfill_sale_dates.js

  Purpose: Safely backfill `sales.sale_date` and `daily_batches.batch_date`
  using each business's stored timezone (`business_accounts.timezone`).

  Behavior:
  - Processes sales in batches to avoid memory spikes.
  - For each sale where business.timezone is set, computes the local date from
    `created_at` using the business timezone and updates `sale_date` when it
    differs.
  - After updating sales, recomputes `daily_batches.batch_date`, total_sales,
    and total_revenue for batches touched by the update.

  Usage:
    NODE_ENV=development node backend/scripts/backfill_sale_dates.js

  NOTE: This script is idempotent — re-running it will not change already-correct rows.
*/

const { supabase } = require('../src/config/supabase');

const BATCH = 500; // number of sales to fetch per iteration

function toTzDate(isoString, tz) {
  // returns YYYY-MM-DD in the target timezone
  try {
    return new Date(isoString).toLocaleDateString('en-CA', { timeZone: tz });
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('\n🔁 Backfill started: aligning sale_date to business timezone');

  let offset = 0;
  let totalChecked = 0;
  let totalUpdated = 0;
  const affectedBatches = new Set();

  while (true) {
    const { data: sales, error } = await supabase
      .from('sales')
      .select('id, created_at, sale_date, batch_id, business_id, business:business_id (timezone)')
      .order('id', { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error fetching sales batch:', error.message || error);
      process.exit(1);
    }

    if (!sales || sales.length === 0) break;

    for (const s of sales) {
      totalChecked++;
      const tz = s.business?.timezone;
      if (!tz) continue; // nothing to do for businesses without timezone

      const tzDate = toTzDate(s.created_at, tz);
      if (!tzDate) continue; // parsing error (skip)

      const oldDate = s.sale_date ? String(s.sale_date) : null;
      if (oldDate !== tzDate) {
        const { error: updErr } = await supabase
          .from('sales')
          .update({ sale_date: tzDate })
          .eq('id', s.id);

        if (updErr) {
          console.error(`Failed to update sale.id=${s.id}:`, updErr.message || updErr);
        } else {
          totalUpdated++;
          if (s.batch_id) affectedBatches.add(s.batch_id);
        }
      }
    }

    console.log(`Processed ${offset + sales.length} rows — updated so far: ${totalUpdated}`);

    offset += BATCH;
    if (sales.length < BATCH) break;
  }

  console.log(`\n✅ Sales processed: ${totalChecked}. Total sale_date updated: ${totalUpdated}`);

  // Recompute daily_batches for affected batches
  if (affectedBatches.size > 0) {
    console.log('\n🔄 Recomputing daily_batches for affected batches...');
    const batchIds = Array.from(affectedBatches);

    // Fetch sales for affected batches in one call
    const { data: affectedSales, error: salesErr } = await supabase
      .from('sales')
      .select('batch_id, sale_date, total_amount, quantity')
      .in('batch_id', batchIds);

    if (salesErr) {
      console.error('Failed to fetch sales for affected batches:', salesErr.message || salesErr);
      process.exit(1);
    }

    const byBatch = {};
    for (const s of affectedSales || []) {
      const bid = s.batch_id;
      if (!byBatch[bid]) byBatch[bid] = { totalSales: 0, totalRevenue: 0, minDate: null };
      byBatch[bid].totalSales += 1;
      byBatch[bid].totalRevenue += parseFloat(s.total_amount || 0);
      if (!byBatch[bid].minDate || (s.sale_date && s.sale_date < byBatch[bid].minDate)) {
        byBatch[bid].minDate = s.sale_date;
      }
    }

    for (const bid of Object.keys(byBatch)) {
      const info = byBatch[bid];
      const updates = {
        total_sales: info.totalSales,
        total_revenue: info.totalRevenue,
        updated_at: new Date().toISOString()
      };
      if (info.minDate) updates.batch_date = info.minDate;

      const { error: updBatchErr } = await supabase
        .from('daily_batches')
        .update(updates)
        .eq('id', bid);

      if (updBatchErr) {
        console.error(`Failed to update daily_batches.id=${bid}:`, updBatchErr.message || updBatchErr);
      } else {
        console.log(`Updated batch ${bid}: date=${info.minDate} sales=${info.totalSales} revenue=${info.totalRevenue}`);
      }
    }
  } else {
    console.log('\nNo batches needed recompute.');
  }

  console.log('\n🎉 Backfill complete — all done.');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error running backfill:', err);
  process.exit(1);
});