'use strict';

// Since 2.57.0 the default install experience is the graphical web wizard
// (create-byan-agent, which starts the local server and opens the browser).
// Two terminal escape hatches stay reachable by flag:
//   --cli    -> the zero-question automatic terminal install (installAuto)
//   --legacy -> the original question-by-question interview (install)
// --legacy wins over --cli when both are passed: it is the more explicit,
// older path, so an operator who typed it means it.
function chooseInstallMode(options = {}) {
  if (options && options.legacy) return 'legacy';
  if (options && options.cli) return 'cli';
  return 'web';
}

module.exports = { chooseInstallMode };
