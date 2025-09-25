import { NextResponse } from 'next/server';
import { endOfDay, isValid, parseISO, startOfDay } from 'date-fns';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMESTAMP_COLUMN = 'created_at';

type HistoryRow = Record<string, unknown>;

function parseDateParam(value: string | null, boundary: 'start' | 'end') {
  if (!value) {
    return undefined;
  }

  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    throw new Error(`Invalid ${boundary} date. Expected ISO format.`);
  }

  return boundary === 'start' ? startOfDay(parsed) : endOfDay(parsed);
}

function collectColumns(rows: HistoryRow[]): string[] {
  const columnSet = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columnSet.add(key));
  });
  return Array.from(columnSet);
}

function toCsv(rows: HistoryRow[]): string {
  if (rows.length === 0) {
    return '';
  }

  const columns = collectColumns(rows);
  const header = columns.join(',');

  const lines = rows.map((row) =>
    columns
      .map((column) => escapeCsvValue(row[column]))
      .join(',')
  );

  return [header, ...lines].join('\r\n');
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return /[",\n]/.test(str) ? `"${escaped}"` : escaped;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    const startDate = parseDateParam(startParam, 'start');
    const endDate = parseDateParam(endParam, 'end');

    let query = supabaseAdmin.from('history_log').select('*');

    if (startDate) {
      query = query.gte(TIMESTAMP_COLUMN, startDate.toISOString());
    }

    if (endDate) {
      query = query.lte(TIMESTAMP_COLUMN, endDate.toISOString());
    }

    const { data, error } = await query.order(TIMESTAMP_COLUMN, { ascending: false });

    if (error) {
      console.error('history_log CSV export failed', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as HistoryRow[];
    const csv = rows.length ? toCsv(rows) : '';

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="history-log.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error generating CSV.';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
