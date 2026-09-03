import { Card } from '../components/ui';

export default function Home() {
  return (
    <Card className="grid gap-2 text-sm text-slate-600">
      <p>
        Demo slice: log in, create a customer, raise an invoice, issue it, and watch it post to a
        balanced ledger. Issuing an invoice also raises an in-app notification.
      </p>
      <p>
        Start at <a href="/login" className="font-medium text-[var(--brand-primary)] underline">Login</a>{' '}
        (demo@tessma.one / demo1234).
      </p>
    </Card>
  );
}
