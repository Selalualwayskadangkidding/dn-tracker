import { HistoryLogViewer } from '@/components/HistoryLogViewer';

export const dynamic = 'force-dynamic';

export default function LogPage() {
  return (
    <main className="page page--log">
      <HistoryLogViewer />
    </main>
  );
}
