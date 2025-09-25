// src/app/page.tsx
import { DailyDashboard } from '@/components/DailyDashboard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type Character = {
  id: string;
  name: string;
};

type DailyState = {
  character_id: string;
  daily_status: 'belum' | 'in_progress' | 'udah' | null;
  wtp: boolean | null;
  sdn_outskirts: boolean | null;
  sdn_core: 'belum' | 'udah' | 'skip' | null;
  golden_active: boolean | null;
  golden_started_at: string | null;
};

// (opsional) filter per user saat dev tanpa Auth:
const DEV_USER_ID = '6c790f9e-04a2-4a35-9c4f-bb7c5f505fa4'; // ganti ke env kalau mau

async function fetchCharacters(): Promise<Character[]> {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', DEV_USER_ID) // hapus baris ini kalau sudah pakai Auth
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to fetch characters', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }

  return data ?? [];
}

async function fetchDailyStates(): Promise<DailyState[]> {
  const { data, error } = await supabaseAdmin
    .from('daily_state')
    .select(
      'character_id, daily_status, wtp, sdn_outskirts, sdn_core, golden_active, golden_started_at'
    )
    .eq('user_id', DEV_USER_ID); // hapus baris ini kalau sudah pakai Auth

  if (error) {
    console.error('Failed to fetch daily_state', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }

  return (data as DailyState[]) ?? [];
}

export default async function HomePage() {
  const [characters, states] = await Promise.all([
    fetchCharacters(),
    fetchDailyStates(),
  ]);

  return (
    <main className="page page--dashboard">
      <DailyDashboard characters={characters} states={states} />
    </main>
  );
}
