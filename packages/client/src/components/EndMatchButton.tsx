import { useEffect, useState } from 'react';

/**
 * Host control to stop the match at any point — e.g. when a side has
 * definitely won. Two taps so a stray click can't end everyone's game.
 */
export function EndMatchButton({ onEnd }: { onEnd: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className="link"
      onClick={() => {
        if (armed) onEnd();
        else setArmed(true);
      }}
    >
      {armed ? 'Tap again to end the match' : 'End match — settle the score'}
    </button>
  );
}
