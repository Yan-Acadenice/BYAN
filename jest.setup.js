// Hermetic test environment.
//
// The jest suite must not depend on ambient BYAN_API_* credentials. A dev or CI
// shell that exports BYAN_API_URL / BYAN_API_TOKEN (as the BYAN platform itself
// does) would otherwise leak into spawned hooks and change staging/flush
// behavior, making env-sensitive suites (staging/*) pass or fail by accident.
// Stripping them here guarantees the suite runs the same everywhere; tests that
// genuinely exercise the with-credentials path set their own env explicitly.
delete process.env.BYAN_API_URL;
delete process.env.BYAN_API_TOKEN;
delete process.env.BYAN_PROJECT_ID;
