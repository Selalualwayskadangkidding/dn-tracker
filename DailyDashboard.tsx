'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, format, isAfter } from 'date-fns';
import { supabaseClient } from '@/lib/supabaseClient';

type Character = {
  id: string;
  name: string;
};

type DailyState = {
  character_id: string;
  daily: string | null;
  wtp: string | null;
  sdn_outskirts: string | null;
  sdn_core: string | null;
  golden_goose: string | null;
  golden_started_at: string | null;
};

type FieldKey = 'daily' | 'wtp' | 'sdn_outskirts' | 'sdn_core' | 'golden_goose';

type RowState = {
  characterId: string;
  name: string;
  golden_started_at: string | null;
  isSaving: boolean;
  lastError: string | null;
} & Record<FieldKey, string>;

type Props = {
  characters: Character[];
  states: DailyState[];
};

const FIELD_CONFIG: Array<{
  key: FieldKey;
  label: string;
  options: string[];
}> = [
  {
    key: 'daily',
    label: 'Daily',
    options: ['Not Started', 'In Progress', 'Completed'],
  },
  {
    key: 'wtp',
    label: 'WTP',
    options: ['Locked', 'Available', 'Cleared'],
  },
  {
    key: 'sdn_outskirts',
    label: 'SDN Outskirts',
    options: ['Not Started', 'Cleared', 'Skipped'],
  },
  {
    key: 'sdn_core',
    label: 'SDN Core',
    options: ['Not Started', 'Cleared', 'Skipped'],
  },
  {
    key: 'golden_goose',
    label: 'Golden Goose',
    options: ['Inactive', 'Active'],
  },
];

const DEFAULT_VALUES: Record<FieldKey, string> = {
  daily: 'Not Started',
  wtp: 'Locked',
  sdn_outskirts: 'Not Started',
  sdn_core: 'Not Started',
  golden_goose: 'Inactive',
};

function getInitialRows(characters: Character[], states: DailyState[]): RowState[] {
  const stateMap = new Map<string, DailyState>();
  states.forEach((state) => stateMap.set(state.character_id, state));

  return characters.map((character) => {
    const existing = stateMap.get(character.id);
    return {
      characterId: character.id,
      name: character.name,
      daily: existing?.daily ?? DEFAULT_VALUES.daily,
      wtp: existing?.wtp ?? DEFAULT_VALUES.wtp,
      sdn_outskirts: existing?.sdn_outskirts ?? DEFAULT_VALUES.sdn_outskirts,
      sdn_core: existing?.sdn_core ?? DEFAULT_VALUES.sdn_core,
      golden_goose: existing?.golden_goose ?? DEFAULT_VALUES.golden_goose,
      golden_started_at: existing?.golden_started_at ?? null,
      isSaving: false,
      lastError: null,
    } satisfies RowState;
  });
}

export function DailyDashboard({ characters, states }: Props) {
  const [rows, setRows] = useState<RowState[]>(() => getInitialRows(characters, states));
  const [feedback, setFeedback] = useState<string | null>(null);
  const supabase = supabaseClient;

  useEffect(() => {
    setRows(getInitialRows(characters, states));
  }, [characters, states]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timeout = setTimeout(() => setFeedback(null), 2500);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const handleValueChange = async (characterId: string, field: FieldKey, value: string) => {
    const targetRow = rows.find((row) => row.characterId === characterId);
    if (!targetRow) {
      return;
    }

    const previousValue = targetRow[field];
    const previousGoldenStartedAt = targetRow.golden_started_at;
    const nextGoldenStartedAt = field === 'golden_goose'
      ? (value === 'Active' ? new Date().toISOString() : null)
      : targetRow.golden_started_at;

    setFeedback(null);
    setRows((prev) =>
      prev.map((row) =>
        row.characterId === characterId
          ? {
              ...row,
              [field]: value,
              golden_started_at: nextGoldenStartedAt,
              isSaving: true,
              lastError: null,
            }
          : row,
      ),
    );

    const payload: Record<string, unknown> = {
      character_id: characterId,
      updated_at: new Date().toISOString(),
    };

    FIELD_CONFIG.forEach(({ key }) => {
      payload[key] = key === field ? value : targetRow[key];
    });

    payload.golden_started_at = nextGoldenStartedAt;

    const { error } = await supabase
      .from('daily_state')
      .upsert(payload, { onConflict: 'character_id' });

    if (error) {
      console.error('Failed to update daily_state', error);
      setRows((prev) =>
        prev.map((row) =>
          row.characterId === characterId
            ? {
                ...row,
                [field]: previousValue,
                golden_started_at: previousGoldenStartedAt,
                isSaving: false,
                lastError: error.message,
              }
            : row,
        ),
      );
      setFeedback('Gagal menyimpan perubahan. Coba lagi.');
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        row.characterId === characterId
          ? {
              ...row,
              golden_started_at: nextGoldenStartedAt,
              isSaving: false,
              lastError: null,
            }
          : row,
      ),
    );
    setFeedback('Perubahan tersimpan!');
  };

  const activeRows = useMemo(() => rows, [rows]);

  return (
    <section className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>TrackRecord Adventure Board</h1>
          <p>Kelola progress harian tim dengan vibe ceria ala Saweria.</p>
        </div>
        {feedback && <span className="dashboard__feedback">{feedback}</span>}
      </header>

      <div className="dashboard__table-wrapper">
        <table className="dashboard__table">
          <thead>
            <tr>
              <th>Character</th>
              {FIELD_CONFIG.map((field) => (
                <th key={field.key}>{field.label}</th>
              ))}
              <th>Expired Golden</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row) => {
              const goldenStarted = row.golden_started_at ? new Date(row.golden_started_at) : null;
              const goldenExpires = goldenStarted ? addDays(goldenStarted, 7) : null;
              const isExpired = goldenExpires ? isAfter(new Date(), goldenExpires) : false;
              const expireLabel = goldenExpires
                ? `${format(goldenExpires, 'dd MMM yyyy')}${isExpired ? ' (Expired)' : ''}`
                : '--';

              return (
                <tr key={row.characterId} className={row.lastError ? 'dashboard__row--error' : ''}>
                  <td>
                    <div className="dashboard__cell-title">
                      <span className="dashboard__name">{row.name}</span>
                      {row.lastError && <span className="dashboard__error">{row.lastError}</span>}
                    </div>
                  </td>
                  {FIELD_CONFIG.map((field) => (
                    <td key={field.key}>
                      <select
                        aria-label={`${row.name} ${field.label}`}
                        className={`dashboard__select${row.isSaving ? ' dashboard__select--loading' : ''}`}
                        value={row[field.key]}
                        onChange={(event) => handleValueChange(row.characterId, field.key, event.target.value)}
                      >
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className={isExpired ? 'dashboard__expired dashboard__expired--active' : 'dashboard__expired'}>
                    {expireLabel}
                  </td>
                  <td>
                    {row.isSaving ? <span className="dashboard__status">Saving...</span> : <span className="dashboard__status">Ready</span>}
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
