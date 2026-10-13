import { useEffect, useState } from 'react';
import { WAITLIST_KEY, hasJoinedWaitlist } from '../lib/waitlist';

// Join-first gate state, extracted verbatim from App.tsx (no behavior change).
// Localhost and ?nowait bypass inside hasJoinedWaitlist().
export function useWaitlistGate(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [waitlistOk, setWaitlistOk] = useState<boolean>(() => hasJoinedWaitlist());
  useEffect(() => {
    const sync = () => setWaitlistOk(hasJoinedWaitlist());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === WAITLIST_KEY) sync();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', sync);
    };
  }, []);
  return [waitlistOk, setWaitlistOk];
}
