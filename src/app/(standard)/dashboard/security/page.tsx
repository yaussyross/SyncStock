import { getCurrentFirstPartyWebSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import RevokeSessionsPanel from '@/components/RevokeSessionsPanel';

export default async function SecurityPage() {
  if (!await getCurrentFirstPartyWebSession()) redirect('/login');
  return <main className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 760 }}>
    <a href="/dashboard">Back to dashboard</a>
    <h1 style={{ fontSize: 28, margin: '20px 0' }}>Session security</h1>
    <RevokeSessionsPanel />
    <p>This control is not multi-factor authentication. MFA and SSO are not available in this draft.</p>
  </main>;
}
