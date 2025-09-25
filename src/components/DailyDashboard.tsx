'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { supabaseClient } from '@/lib/supabaseClient';

type Character = { id: string; name: string };

type DailyStateDB = {
  character_id: string;
  daily_status: 'belum' | 'in_progress' | 'udah' | null;
  wtp: boolean | null;
  sdn_outskirts: boolean | null;
  sdn_core: 'belum' | 'udah' | 'skip' | null;
  golden_active: boolean | null;
  golden_started_at: string | null;
};

type Props = {
  characters: Character[];
  states: DailyStateDB[];
};

// DEV ONLY: ganti dengan user_id / auth.uid() milikmu saat sudah siap Auth
const DEV_USER_ID = '6c790f9e-04a2-4a35-9c4f-bb7c5f505fa4';

// WIB YYYY-MM-DD
function todayJakartaISODate() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const wib = new Date(utcMs + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

/* ---------- UI <-> DB mapping helpers ---------- */

// Daily
const DAILY_LABELS = ['Not Started', 'In Progress', 'Completed'] as const;
type DailyLabel = (typeof DAILY_LABELS)[number];
const dailyLabelToDb: Record<DailyLabel, DailyStateDB['daily_status']> = {
  'Not Started': 'belum',
  'In Progress': 'in_progress',
  Completed: 'udah',
};
const dbToDailyLabel: Record<NonNullable<DailyStateDB['daily_status']>, DailyLabel> = {
  belum: 'Not Started',
  in_progress: 'In Progress',
  udah: 'Completed',
};

// WTP (boolean) - treat Cleared = true, sisanya false
const WTP_LABELS = ['Locked', 'Available', 'Cleared'] as const;
type WtpLabel = (typeof WTP_LABELS)[number];
const wtpLabelToDb = (label: WtpLabel) => label === 'Cleared';
const dbToWtpLabel = (value: boolean | null): WtpLabel => (value ? 'Cleared' : 'Locked');

// SDN Outskirts (boolean) - Skipped dianggap false
const OUT_LABELS = ['Not Started', 'Cleared', 'Skipped'] as const;
type OutLabel = (typeof OUT_LABELS)[number];
const outskirtsLabelToDb = (label: OutLabel) => label === 'Cleared';
const dbToOutskirtsLabel = (value: boolean | null): OutLabel => (value ? 'Cleared' : 'Not Started');

// SDN Core (enum)
const CORE_LABELS = ['Not Started', 'Cleared', 'Skipped'] as const;
type CoreLabel = (typeof CORE_LABELS)[number];
const coreLabelToDb: Record<CoreLabel, NonNullable<DailyStateDB['sdn_core']>> = {
  'Not Started': 'belum',
  Cleared: 'udah',
  Skipped: 'skip',
};
const dbToCoreLabel: Record<NonNullable<DailyStateDB['sdn_core']>, CoreLabel> = {
  belum: 'Not Started',
  udah: 'Cleared',
  skip: 'Skipped',
};

// Golden Goose (boolean)
const GOLDEN_LABELS = ['Inactive', 'Active'] as const;
type GoldenLabel = (typeof GOLDEN_LABELS)[number];
const goldenLabelToDb = (label: GoldenLabel) => label === 'Active';
const dbToGoldenLabel = (value: boolean | null): GoldenLabel => (value ? 'Active' : 'Inactive');

/* ---------- Row shape for UI ---------- */

type RowState = {
  characterId: string;
  name: string;
  daily: DailyLabel;
  wtp: WtpLabel;
  sdn_outskirts: OutLabel;
  sdn_core: CoreLabel;
  golden_goose: GoldenLabel;
  golden_started_at: string | null;
  isSaving: boolean;
  lastError: string | null;
};

const DEFAULT_ROW: Omit<RowState, 'characterId' | 'name'> = {
  daily: 'Not Started',
  wtp: 'Locked',
  sdn_outskirts: 'Not Started',
  sdn_core: 'Not Started',
  golden_goose: 'Inactive',
  golden_started_at: null,
  isSaving: false,
  lastError: null,
};

export function DailyDashboard({ characters, states }: Props) {
  const mapByChar = useMemo(() => {
    const map = new Map<string, DailyStateDB>();
    states.forEach((state) => map.set(state.character_id, state));
    return map;
  }, [states]);

  const [rows, setRows] = useState<RowState[]>(() =>
    characters.map((character) => {
      const state = mapByChar.get(character.id);
      return {
        characterId: character.id,
        name: character.name,
        daily: state?.daily_status ? dbToDailyLabel[state.daily_status] : DEFAULT_ROW.daily,
        wtp: dbToWtpLabel(state?.wtp ?? null),
        sdn_outskirts: dbToOutskirtsLabel(state?.sdn_outskirts ?? null),
        sdn_core: state?.sdn_core ? dbToCoreLabel[state.sdn_core] : DEFAULT_ROW.sdn_core,
        golden_goose: dbToGoldenLabel(state?.golden_active ?? null),
        golden_started_at: state?.golden_started_at ?? null,
        isSaving: false,
        lastError: null,
      };
    })
  );

  useEffect(() => {
    setRows(
      characters.map((character) => {
        const state = mapByChar.get(character.id);
        return {
          characterId: character.id,
          name: character.name,
          daily: state?.daily_status ? dbToDailyLabel[state.daily_status] : DEFAULT_ROW.daily,
          wtp: dbToWtpLabel(state?.wtp ?? null),
          sdn_outskirts: dbToOutskirtsLabel(state?.sdn_outskirts ?? null),
          sdn_core: state?.sdn_core ? dbToCoreLabel[state.sdn_core] : DEFAULT_ROW.sdn_core,
          golden_goose: dbToGoldenLabel(state?.golden_active ?? null),
          golden_started_at: state?.golden_started_at ?? null,
          isSaving: false,
          lastError: null,
        };
      })
    );
  }, [characters, mapByChar]);

  async function upsertFor(characterId: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((row) =>
        row.characterId === characterId
          ? {
              ...row,
              ...patch,
              isSaving: true,
              lastError: null,
            }
          : row
      )
    );

    try {
      const date = todayJakartaISODate();
      const baseRow = rows.find((row) => row.characterId === characterId);
      if (!baseRow) {
        throw new Error('Row not found');
      }
      const next = { ...baseRow, ...patch };

      const payload = {
        user_id: DEV_USER_ID,
        character_id: characterId,
        date,
        daily_status: dailyLabelToDb[next.daily],
        wtp: wtpLabelToDb(next.wtp),
        sdn_outskirts: outskirtsLabelToDb(next.sdn_outskirts),
        sdn_core: coreLabelToDb[next.sdn_core],
        golden_active: goldenLabelToDb(next.golden_goose),
        golden_started_at: goldenLabelToDb(next.golden_goose)
          ? next.golden_started_at ?? new Date().toISOString()
          : null,
      };

      const { error } = await supabaseClient
        .from('daily_state')
        .upsert(payload, { onConflict: 'date,character_id' });

      if (error) {
        throw error;
      }

      setRows((prev) =>
        prev.map((row) =>
          row.characterId === characterId
            ? {
                ...next,
                golden_started_at: payload.golden_started_at,
                isSaving: false,
                lastError: null,
              }
            : row
        )
      );
    } catch (error) {
      console.error('Failed to upsert daily_state', error);
      setRows((prev) =>
        prev.map((row) =>
          row.characterId === characterId
            ? {
                ...row,
                isSaving: false,
                lastError: error instanceof Error ? error.message : 'Failed to save',
              }
            : row
        )
      );
    }
  }

  const now = new Date();

  return (
    <section className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>DoomDye</h1>
          <p>Track Record Dragon Nest Character Progress</p>
        </div>
        <div className="dashboard__actions">
          <Link href="/log" className="dashboard__button">Buka History Log</Link>
        </div>
      </header>

      <div className="dashboard__table-wrapper">
        <table className="dashboard__table">
          <thead>
            <tr>
              <th>Character</th>
              <th>Daily</th>
              <th>WTP</th>
              <th>SDN Outskirts</th>
              <th>SDN Core</th>
              <th>Golden Goose</th>
              <th>Expired Golden</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const startedAt = row.golden_started_at ? new Date(row.golden_started_at) : null;
              const expiredAt = startedAt ? addDays(startedAt, 7) : null;
              const daysLeft = expiredAt ? differenceInCalendarDays(expiredAt, now) : null;
              const isExpired = typeof daysLeft === 'number' && daysLeft < 0;
              const expiredLabel = expiredAt
                ? `${isExpired ? 'Expired' : `${daysLeft} hari lagi`} (${format(expiredAt, 'yyyy-MM-dd')})`
                : '--';

              const selectClass = `dashboard__select${row.isSaving ? ' dashboard__select--loading' : ''}`;
              const statusClass = `dashboard__status${row.isSaving ? ' dashboard__status--saving' : ''}`;
              const expiredClass = `dashboard__expired${isExpired ? ' dashboard__expired--active' : ''}`;

              return (
                <tr key={row.characterId} className={row.lastError ? 'dashboard__row--error' : undefined}>
                  <td>
                    <div className="dashboard__cell-title">
                      <span className="dashboard__name">{row.name}</span>
                      {row.lastError && <span className="dashboard__error">{row.lastError}</span>}
                    </div>
                  </td>
                  <td>
                    <select
                      className={selectClass}
                      aria-label={`${row.name} Daily`}
                      value={row.daily}
                      onChange={(event) =>
                        upsertFor(row.characterId, { daily: event.target.value as DailyLabel })
                      }
                      disabled={row.isSaving}
                    >
                      {DAILY_LABELS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={selectClass}
                      aria-label={`${row.name} WTP`}
                      value={row.wtp}
                      onChange={(event) =>
                        upsertFor(row.characterId, { wtp: event.target.value as WtpLabel })
                      }
                      disabled={row.isSaving}
                    >
                      {WTP_LABELS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={selectClass}
                      aria-label={`${row.name} SDN Outskirts`}
                      value={row.sdn_outskirts}
                      onChange={(event) =>
                        upsertFor(row.characterId, { sdn_outskirts: event.target.value as OutLabel })
                      }
                      disabled={row.isSaving}
                    >
                      {OUT_LABELS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={selectClass}
                      aria-label={`${row.name} SDN Core`}
                      value={row.sdn_core}
                      onChange={(event) =>
                        upsertFor(row.characterId, { sdn_core: event.target.value as CoreLabel })
                      }
                      disabled={row.isSaving}
                    >
                      {CORE_LABELS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={selectClass}
                      aria-label={`${row.name} Golden Goose`}
                      value={row.golden_goose}
                      onChange={(event) => {
                        const value = event.target.value as GoldenLabel;
                        upsertFor(row.characterId, {
                          golden_goose: value,
                          golden_started_at: value === 'Active' ? new Date().toISOString() : null,
                        });
                      }}
                      disabled={row.isSaving}
                    >
                      {GOLDEN_LABELS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={expiredClass}>{expiredLabel}</td>
                  <td>
                    <span className={statusClass}>{row.isSaving ? 'Saving...' : 'Ready'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}




