import { useRef, useState } from 'react';
import { iceTestTargets, testIceTarget } from '../p2p/protocol';
import type { IceTestTarget } from '../p2p/protocol';

type RowState = 'testing' | 'ok' | 'fail';
interface Row {
  target: IceTestTarget;
  state: RowState;
}

/**
 * Per-device reachability check for every STUN/TURN server the game uses.
 * When a join fails, running this on both devices shows whose network is
 * the problem — and whether a relay can rescue it.
 */
export function ConnectionTest() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  const run = async () => {
    const id = ++runId.current;
    const targets = iceTestTargets();
    setRows(targets.map((target) => ({ target, state: 'testing' as RowState })));
    setRunning(true);
    await Promise.all(
      targets.map(async (target, i) => {
        const ok = await testIceTarget(target);
        if (runId.current !== id) return;
        setRows((prev) =>
          prev === null
            ? prev
            : prev.map((row, j) => (j === i ? { ...row, state: ok ? 'ok' : 'fail' } : row)),
        );
      }),
    );
    if (runId.current === id) setRunning(false);
  };

  const done = rows !== null && !running && rows.every((r) => r.state !== 'testing');
  const relayOk = done && rows.some((r) => r.target.kind === 'TURN' && r.state === 'ok');
  const anyOk = done && rows.some((r) => r.state === 'ok');

  return (
    <div className="online-box conn-test">
      <div className="online-title">🔧 Connection self-test</div>
      <p className="online-hint">
        Checks whether <strong>this device</strong> can reach the servers the game connects
        through. If a join fails with "couldn't connect to the host," run this on both devices
        and compare.
      </p>
      <button onClick={run} disabled={running}>
        {running ? 'Testing…' : "Test this device's connection"}
      </button>
      {rows !== null && (
        <div className="conn-table">
          <div className="conn-row conn-head">
            <span>Server</span>
            <span>Kind</span>
            <span>Result</span>
          </div>
          {rows.map((row, i) => (
            <div className="conn-row" key={i}>
              <span className="conn-server">
                {row.target.label}
                {row.target.dedicated && <strong> (dedicated)</strong>}
              </span>
              <span>{row.target.kind === 'TURN' ? 'TURN relay' : 'STUN'}</span>
              <span>
                {row.state === 'testing'
                  ? '⏳ testing…'
                  : row.state === 'ok'
                    ? '✅ working'
                    : row.target.kind === 'TURN'
                      ? '❌ no relay candidate'
                      : '❌ no response'}
              </span>
            </div>
          ))}
        </div>
      )}
      {done && (
        <p className="conn-verdict">
          {relayOk
            ? '✅ A relay is reachable — joins from this device should work on any network.'
            : anyOk
              ? '⚠️ No relay is reachable — joins may fail across networks; same-network play can still work. Try mobile data.'
              : "❌ This network blocks the game's connection servers — switch to mobile data or another network."}
        </p>
      )}
    </div>
  );
}
