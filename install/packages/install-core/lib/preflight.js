'use strict';

// ES5-ONLY. This guard must parse and run on ancient Node (0.x/4/8) so it can
// print a clear "your Node is too old" message BEFORE any modern require would
// throw a SyntaxError. Therefore: no const/let, no arrow functions, no template
// literals, no rest/spread, no destructuring. Plain ES5 only.

var MIN_MAJOR = 18;

// parseMajor extracts the leading major version number from a version string
// such as "24.13.1" or "v24.13.1". Returns NaN when it cannot be parsed.
function parseMajor(versionString) {
  if (versionString === null || versionString === undefined) {
    return NaN;
  }
  var text = String(versionString);
  if (text.charAt(0) === 'v' || text.charAt(0) === 'V') {
    text = text.slice(1);
  }
  var firstSegment = text.split('.')[0];
  return parseInt(firstSegment, 10);
}

// checkNode evaluates a given Node version string against a minimum major.
// Pure: returns { ok: boolean, message: string }, never exits the process.
function checkNode(versionString, minMajor) {
  var minimum = (typeof minMajor === 'number') ? minMajor : MIN_MAJOR;
  var major = parseMajor(versionString);

  if (isNaN(major)) {
    return {
      ok: false,
      message: 'BYAN install: could not read the Node.js version "' +
        String(versionString) + '". Node ' + minimum +
        '.x or newer is required.'
    };
  }

  if (major < minimum) {
    return {
      ok: false,
      message: 'BYAN install: Node.js ' + minimum +
        '.x or newer is required, but this is ' + String(versionString) +
        '. Please upgrade Node (see https://nodejs.org) and re-run the installer.'
    };
  }

  return {
    ok: true,
    message: 'Node.js ' + String(versionString) +
      ' satisfies the minimum (' + minimum + '.x).'
  };
}

// preflight reads the running Node version and checks it against minMajor
// (defaulting to MIN_MAJOR). Pure: returns the verdict so the caller decides
// whether to print and exit. Never calls process.exit itself.
function preflight(minMajor) {
  var running = (process && process.versions && process.versions.node) ?
    process.versions.node : process.version;
  return checkNode(running, minMajor);
}

module.exports = {
  preflight: preflight,
  checkNode: checkNode,
  MIN_MAJOR: MIN_MAJOR
};
