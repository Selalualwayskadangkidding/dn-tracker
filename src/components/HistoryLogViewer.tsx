'use client';

import { useEffect, useMemo, useState } from 'react';
import { endOfDay, format, isValid, parseISO, startOfDay, subDays } from 'date-fns';
import { supabaseClient } from '@/lib/supabaseClient';

type HistoryRow = Record<string, any>;

// urutan kolom yang diutamakan (pakai snapshot_date, bukan created_at)
const PREFERRED_ORDER = [
  'snapshot_date',
  'character_name',
  'character_id',
  'action',
  'details',
  'notes',
  'daily_status',
  'wtp',
  'sdn_outskirts',
  'sdn_core',
  'golden_active',
  'golden_started_at',
  'golden_expired_at',
];

const DEV_USER_ID = '6c790f9e-04a2-4a35-9c4f-bb7c5f505fa4'; // ganti nanti ke auth.uid()

function orderColumns(rows: HistoryRow[]): string[] {
  const seen = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((k) => !seen.has(k) && seen.add(k)));
  const dynamic = Array.from(seen).sort((a, b) => {
    const ia = PREFERRED_ORDER.indexOf(a);
    const ib = PREFERRED_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return dynamic;
}

function normaliseDateInput(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function formatCellValue(column: string, value: unknown): string {
  if (value === null || value === undefined) return '--';
  if (value instanceof Date) return format(value, 'dd MMM yyyy HH:mm');

  // kolom *_at → waktu; snapshot_date → tanggal
  if (typeof value === 'string') {
    if (column === 'snapshot_date') {
      const d = parseISO(value);
      if (isValid(d)) return format(d, 'dd MMM yyyy');
    }
    if (column.endsWith('_at')) {
      const d = parseISO(value);
      if (isValid(d)) return format(d, 'dd MMM yyyy HH:mm');
    }
  }
  return String(value);
}

export function HistoryLogViewer() {
  const supabase = supabaseClient;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const start = normaliseDateInput(startDate);
      const end = normaliseDateInput(endDate);
      if (start && end && start > end) {
        setError('Rentang tanggal tidak valid.');
        setRows([]);
        setLoading(false);
        return;
      }

      // pakai snapshot_date + filter user_id
      let query = supabase
        .from('history_log')
        .select('*')
        .eq('user_id', DEV_USER_ID)
        .order('snapshot_date', { ascending: false });

      if (start) query = query.gte('snapshot_date', startOfDay(start).toISOString().slice(0, 10));
      if (end)   query = query.lte('snapshot_date', endOfDay(end).toISOString().slice(0, 10));

      const { data, error: fetchError } = await query;

      if (cancelled) return;

      if (fetchError) {
        console.error('Failed to fetch history_log', fetchError);
        setError(fetchError.message);
        setRows([]);
      } else {
        setRows((data ?? []) as HistoryRow[]);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const columns = useMemo(() => orderColumns(rows), [rows]);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);

      const start = normaliseDateInput(startDate);
      const end = normaliseDateInput(endDate);
      if (start && end && start > end) {
        setError('Rentang tanggal tidak valid.');
        return;
      }

      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);
      // sertakan user_id agar export server-side memfilter juga
      params.set('user_id', DEV_USER_ID);

      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) throw new Error('Gagal membuat CSV.');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `history-log-${startDate || 'all'}_${endDate || 'all'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh CSV.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="log">
      <header className="log__header">
        <div>
          <h1>History Log</h1>
          <p>Pilih rentang tanggal untuk melihat aktifitas karakter.</p>
        </div>
        <div className="log__controls">
          <label className="log__date-picker">
            <span>Dari</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="log__date-picker">
            <span>Sampai</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button className="log__export" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </header>

      {error && <p className="log__error">{error}</p>}

      <div className="log__table-wrapper">
        {loading ? (
          <p className="log__loading">Memuat data...</p>
        ) : rows.length === 0 ? (
          <p className="log__empty">Tidak ada data pada rentang ini.</p>
        ) : (
          <table className="log__table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{formatCellValue(c, row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
