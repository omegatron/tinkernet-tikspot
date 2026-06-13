// Disconnect ("kick") an active hotspot user via RADIUS CoA Disconnect-Request,
// sent with radclient to the NAS (the MikroTik) on its CoA port (default 3799).
// This is the RADIUS-native way to drop a session and does not need the RouterOS
// API. The NAS must accept CoA with the matching shared secret.

import { spawn } from 'node:child_process';

const COA_PORT = Number(process.env.TIKSPOT_COA_PORT ?? 3799);

// Run radclient, feeding the attributes on stdin. Resolves with {ok, output}.
function runRadclient({ target, secret, attrs }) {
  return new Promise((resolve) => {
    const args = ['-x', '-t', '3', '-r', '2', `${target}:${COA_PORT}`, 'disconnect', secret];
    let out = '';
    let proc;
    try {
      proc = spawn('radclient', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, output: String(err.message ?? err) });
      return;
    }
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (out += d));
    proc.on('error', (err) => resolve({ ok: false, output: String(err.message ?? err) }));
    proc.on('close', (code) => {
      // radclient exits 0 and prints "Received Disconnect-ACK" on success.
      const acked = /Disconnect-ACK/i.test(out);
      resolve({ ok: code === 0 && acked, output: out.trim() });
    });
    const lines = Object.entries(attrs)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k} = ${JSON.stringify(String(v))}`)
      .join('\n');
    proc.stdin.write(lines + '\n');
    proc.stdin.end();
  });
}

/**
 * Disconnect a session. Requires the NAS IP and the session's Acct-Session-Id
 * (RFC 5176: NAS-IP-Address + a session identifier). Optionally User-Name and
 * Framed-IP-Address to help the NAS match.
 */
export async function disconnectSession({ nasip, secret, acctSessionId, username, framedIp }) {
  if (!nasip) return { ok: false, output: 'no NAS IP for session' };
  return runRadclient({
    target: nasip,
    secret,
    attrs: {
      'Acct-Session-Id': acctSessionId,
      'NAS-IP-Address': nasip,
      'User-Name': username,
      'Framed-IP-Address': framedIp,
    },
  });
}
