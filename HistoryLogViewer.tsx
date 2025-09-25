'use client';

import { useEffect, useMemo, useState } from 'react';
import { endOfDay, format, isValid, parseISO, startOfDay, subDays } from 'date-fns';
import { supabaseClient } from '@/lib/supabaseClient';

type HistoryRow = Record<string, unknown>;

const PREFERRED_ORDER = ['created_at', 'character_name', 'character_id', 'action', 'details', 'notes'];

function orderColumns(rows: HistoryRow[]): string[] {
  const seen = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
      }
    });
  });

  const dynamicOrder = Array.from(seen).sort((a, b) => {
    const indexA = PREFERRED_ORDER.indexOf(a);
    const indexB = PREFERRED_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) {
      return a.localeCompare(b);
    }
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return dynamicOrder;
}

function normaliseDateInput(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    return null;
  }
  return parsed;
}

function formatCellValue(column: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '--';
  }

  if (value instanceof Date) {
    return format(value, 'dd MMM yyyy HH:mm');
  }

  if (typeof value === 'string' && column.endsWith('_at')) {
    const parsed = parseISO(value);
    if (isValid(parsed)) {
      return format(parsed, 'dd MMM yyyy HH:mm');
    }
  }

  return String(value);
}

export function HistoryLogViewer() {
  const supabase = supabaseClient;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
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

      let query = supabase.from('history_log').select('*').order('created_at', { ascending: false });

      if (start) {
        query = query.gte('created_at', startOfDay(start).toISOString());
      }

      if (end) {
        query = query.lte('created_at', endOfDay(end).toISOString());
      }

      const { data, error: fetchError } = await query;

      if (cancelled) {
        return;
      }

      if (fetchError) {
        console.error('Failed to fetch history_log', fetchError);
        setError(fetchError.message);
        setRows([]);
      } else {
        setRows((data ?? []) as HistoryRow[]);
      }

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, supabase]);

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
      const query = params.toString();
      const endpoint = query ? `/api/export?${query}` : '/api/export';

      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Gagal membuat CSV.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const suffix = [startDate || 'all', endDate || 'all'].join('_');
      link.href = url;
      link.download = `history-log-${suffix}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengunduh CSV.';
      setError(message);
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
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="log__date-picker">
            <span>Sampai</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
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
                {columns.map((column) => (
                  <th key={column}>{column.replace(/_/g, ' ')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td key={column}>{formatCellValue(column, row[column])}</td>
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
