/**
 * LoadBalancer Configuration Loader
 *
 * Loads loadbalancer.yaml, merges with defaults, resolves env vars.
 * Config resolution order:
 *   1. loadbalancer.default.yaml (bundled defaults)
 *   2. {project-root}/_byan/loadbalancer.yaml (user overrides)
 *   3. Environment variables (BYAN_LB_PRIMARY, etc.)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULT_CONFIG_PATH = path.join(__dirname, 'loadbalancer.default.yaml');

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadYaml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.load(content);
}

function resolveEnvOverrides(config) {
  const envMap = {
    BYAN_LB_PRIMARY: 'primary',
    BYAN_LB_PORT: 'mcp_server.port',
    BYAN_LB_HOST: 'mcp_server.host',
    BYAN_LB_LOG_LEVEL: 'logging.level',
  };

  for (const [envKey, configPath] of Object.entries(envMap)) {
    const val = process.env[envKey];
    if (val === undefined) continue;

    const parts = configPath.split('.');
    let target = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }

    const lastKey = parts[parts.length - 1];
    target[lastKey] = isNaN(val) ? val : Number(val);
  }

  return config;
}

function validateConfig(config) {
  const errors = [];

  if (!config.providers || typeof config.providers !== 'object') {
    errors.push('providers: must be an object with at least one provider');
  }

  if (!config.primary) {
    errors.push('primary: must specify a primary provider');
  } else if (!config.providers?.[config.primary]) {
    errors.push(`primary: provider "${config.primary}" not found in providers`);
  }

  if (!Array.isArray(config.fallback_order)) {
    errors.push('fallback_order: must be an array');
  }

  const rl = config.rate_limits;
  if (rl) {
    if (typeof rl.window_ms !== 'number' || rl.window_ms <= 0) {
      errors.push('rate_limits.window_ms: must be a positive number');
    }
    if (typeof rl.max_429_in_window !== 'number' || rl.max_429_in_window <= 0) {
      errors.push('rate_limits.max_429_in_window: must be a positive number');
    }
  }

  return errors;
}

function loadConfig(projectRoot) {
  const defaults = loadYaml(DEFAULT_CONFIG_PATH) || {};

  const userConfigPath = path.join(projectRoot, '_byan', 'loadbalancer.yaml');
  const userConfig = loadYaml(userConfigPath) || {};

  let config = deepMerge(defaults, userConfig);
  config = resolveEnvOverrides(config);

  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`LoadBalancer config validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  config._resolved = {
    projectRoot,
    configSources: [
      DEFAULT_CONFIG_PATH,
      ...(fs.existsSync(userConfigPath) ? [userConfigPath] : []),
    ],
  };

  return config;
}

function getEnabledProviders(config) {
  return Object.entries(config.providers)
    .filter(([, p]) => p.enabled !== false)
    .map(([name, p]) => ({ name, ...p }));
}

function getProviderOrder(config) {
  const order = [config.primary, ...config.fallback_order];
  return order.filter(name => config.providers[name]?.enabled !== false);
}

module.exports = {
  loadConfig,
  validateConfig,
  getEnabledProviders,
  getProviderOrder,
  deepMerge,
  DEFAULT_CONFIG_PATH,
};
