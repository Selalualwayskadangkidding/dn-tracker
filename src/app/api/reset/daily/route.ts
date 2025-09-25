import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // 1) simpan snapshot harian ke history_log (default WIB di fungsi SQL)
  let { error } = await supabaseAdmin.rpc('history_snapshot_rpc');
  if (error) {
    console.error('history_snapshot_rpc failed', error);
    return NextResponse.json({ ok: false, step: 'snapshot', error: error.message }, { status: 500 });
  }

  // 2) jalankan reset harian (expire golden + daily_status -> 'belum')
  ({ error } = await supabaseAdmin.rpc('daily_reset_rpc'));
  if (error) {
    console.error('daily_reset_rpc failed', error);
    return NextResponse.json({ ok: false, step: 'daily_reset', error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// (opsional) izinkan POST juga
export const POST = GET;
