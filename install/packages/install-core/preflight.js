'use strict';

// byan-install-core/preflight — the dependency-free, ES5-safe entry point.
//
// WHY a separate entry: requiring this file pulls ONLY the ES5 preflight
// primitive (lib/preflight). It does NOT load index.js, fs-extra,
// child_process, or any detect/plan/apply module. A front-end bin can therefore
// require this on an ancient Node engine to check the version and print a clear
// message BEFORE the modern install engine is ever loaded (C10).
//
// Usage in a launcher (itself written in ES5):
//   var pf = require('byan-install-core/preflight');
//   var r = pf.preflight();            // { ok: boolean, message: string }
//   if (!r.ok) { console.error(r.message); process.exit(1); }
//   var engine = require('byan-install-core'); // only now load the modern code

module.exports = require('./lib/preflight');
