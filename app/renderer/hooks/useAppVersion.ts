// The app's real version, read from main.
//
// Four places wrote `v1.0` as a literal while the app shipped 1.4.0: the status
// bar, the login footer, the onboarding footer and the settings page. A version
// string is a fact about the running binary, and a literal cannot stay true.
//
// Returns null until main answers. Callers render NOTHING in that window rather
// than a placeholder: the reader cannot tell an unknown version from a wrong one,
// so a guess is worse than a blank.

import { useEffect, useState } from 'react';

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const v = await window.byanApi.app.version();
        if (alive) setVersion(v);
      } catch {
        // Bridge silent. Stay null — see above.
      }
    })();
    return () => { alive = false; };
  }, []);

  return version;
}

// `1.4.0` -> `v1.4.0`, and `v2.0.0` -> `v2.0.0`. Empty string when unknown, so a
// template can interpolate it without printing "null".
export function formatVersion(version: string | null): string {
  if (!version) return '';
  return version.startsWith('v') ? version : `v${version}`;
}
