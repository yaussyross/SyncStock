'use client';
import { useEffect, useRef, useState } from 'react';

export default function RevokeSessionsPanel() {
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState<'idle'|'working'|'done'|'unknown'|'signin'|'failed'>('idle');
  const busy = useRef(false), request = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  async function revoke() {
    if (!confirmed || busy.current || status !== 'idle') return;
    busy.current = true; setStatus('working');
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('/api/auth/revoke-sessions', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (response.status === 200 && body?.ok === true && body?.scope === 'first_party_sessions') setStatus('done');
      else if (response.status === 401 || response.status === 409) setStatus('signin');
      else if (response.status >= 500 || response.ok) setStatus('unknown');
      else setStatus('failed');
    } catch { if (mounted.current) setStatus('unknown'); }
    finally { window.clearTimeout(timeout); request.current = null; }
  }
  return <section className="card" aria-busy={status === 'working'}>
    <h2 style={{ fontSize: 20 }}>Sign out password-based sessions</h2>
    <p>This signs out your existing SyncStock password-based web and mobile sessions, including this browser. Sign in again afterward.</p>
    <p>It does not sign you out of Shopify, disconnect provider accounts, change your password, or stop sync work already running. If someone knows your password, signing out sessions does not stop them signing in again.</p>
    {status === 'idle' || status === 'working' ? <>
      <label style={{ display: 'flex', gap: 10, margin: '18px 0' }}><input type="checkbox" checked={confirmed} disabled={status === 'working'} onChange={event => setConfirmed(event.target.checked)} />I want to sign out these sessions, including this browser.</label>
      <button className="btn" disabled={!confirmed || status === 'working'} onClick={revoke}>{status === 'working' ? 'Signing out sessions…' : 'Sign out these sessions'}</button>
    </> : <div role="status" aria-live="polite">
      {status === 'done' && <p>Your previous password-based sessions are signed out.</p>}
      {status === 'unknown' && <p>We could not confirm whether the sessions were signed out. This action has not been retried. Sign in again and check before trying again.</p>}
      {status === 'signin' && <p>Your session is expired or has changed. Sign in again before managing sessions.</p>}
      {status === 'failed' && <p>The sign-out request was not accepted. Sign in again to continue.</p>}
      <a className="btn btn-secondary" href="/login">Sign in again</a>
    </div>}
  </section>;
}
