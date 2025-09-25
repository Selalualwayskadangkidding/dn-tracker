import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function triggerWeeklyReset() {
  const { data, error } = await supabaseAdmin.rpc('weekly_reset_rpc');

  if (error) {
    console.error('weekly_reset_rpc failed', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? null });
}

export async function GET() {
  return triggerWeeklyReset();
}

export async function POST() {
  return triggerWeeklyReset();
}
