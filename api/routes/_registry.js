'use strict';

module.exports = function registerWorker3Routes(router, auth) {
  require('./memory')(router, auth);
  require('./sessions')(router, auth);
  require('./agents')(router, auth);
  require('./mcp')(router, auth);
};
