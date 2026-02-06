/**
 * Dashboard for BYAN v2.0
 * Provides formatted console output for system status, metrics, and logs
 * 
 * @module observability/dashboard/dashboard
 * @version 2.0.0-HYPER-MVP
 */

/**
 * Print dashboard to console with formatted output
 * 
 * @param {Object} data - Dashboard data
 * @param {Object} [data.metrics={}] - Metrics from MetricsCollector
 * @param {Array} [data.logs=[]] - Recent logs from StructuredLogger
 * @param {Array} [data.workers=[]] - Active workers
 * @param {Object} [data.status={}] - System status
 * @returns {string} Formatted dashboard output
 * 
 * @example
 * const output = printDashboard({
 *   metrics: metricsCollector.getMetrics(),
 *   logs: logger.getLogs().slice(-5),
 *   workers: pool.getActiveWorkers(),
 *   status: { uptime: 3600, version: '2.0.0' }
 * });
 * console.log(output);
 */
function printDashboard(data = {}) {
  // Handle null data
  if (!data) {
    data = {};
  }
  const { metrics = {}, logs = [], workers = [], status = {} } = data;

  const lines = [];

  // Header
  lines.push('╔═══════════════════════════════════════════════════════════╗');
  lines.push('║           BYAN v2.0 Dashboard                             ║');
  lines.push('╚═══════════════════════════════════════════════════════════╝');
  lines.push('');

  // Status Section
  lines.push('┌─ Status ──────────────────────────────────────────────────┐');
  if (Object.keys(status).length > 0) {
    Object.entries(status).forEach(([key, value]) => {
      lines.push(`│ ${_padRight(key, 15)}: ${value}`);
    });
  } else {
    lines.push('│ No status information available');
  }
  lines.push('└───────────────────────────────────────────────────────────┘');
  lines.push('');

  // Metrics Section
  lines.push('┌─ Metrics ─────────────────────────────────────────────────┐');
  const metricsArray = Object.entries(metrics);
  if (metricsArray.length > 0) {
    metricsArray.slice(0, 10).forEach(([key, metric]) => {
      const displayKey = key.length > 30 ? key.substring(0, 27) + '...' : key;
      const displayValue = _formatMetricValue(metric.value);
      lines.push(`│ ${_padRight(displayKey, 30)}: ${displayValue}`);
    });
    if (metricsArray.length > 10) {
      lines.push(`│ ... and ${metricsArray.length - 10} more metrics`);
    }
  } else {
    lines.push('│ No metrics available');
  }
  lines.push('└───────────────────────────────────────────────────────────┘');
  lines.push('');

  // Recent Logs Section
  lines.push('┌─ Recent Logs ─────────────────────────────────────────────┐');
  if (logs.length > 0) {
    logs.slice(-5).forEach((log) => {
      const level = _padRight(`[${log.level.toUpperCase()}]`, 8);
      const message = log.message.length > 40 ? log.message.substring(0, 37) + '...' : log.message;
      lines.push(`│ ${level} ${message}`);
    });
  } else {
    lines.push('│ No recent logs');
  }
  lines.push('└───────────────────────────────────────────────────────────┘');
  lines.push('');

  // Workers Section
  lines.push('┌─ Workers ─────────────────────────────────────────────────┐');
  if (workers.length > 0) {
    workers.forEach((worker) => {
      const id = _padRight(`Worker ${worker.id}`, 15);
      const status = worker.status || 'unknown';
      lines.push(`│ ${id}: ${status}`);
    });
  } else {
    lines.push('│ No active workers');
  }
  lines.push('└───────────────────────────────────────────────────────────┘');

  return lines.join('\n');
}

/**
 * Pad string to right with spaces
 * 
 * @private
 * @param {string} str - String to pad
 * @param {number} length - Target length
 * @returns {string} Padded string
 */
function _padRight(str, length) {
  const s = String(str);
  return s.length >= length ? s : s + ' '.repeat(length - s.length);
}

/**
 * Format metric value for display
 * 
 * @private
 * @param {number} value - Metric value
 * @returns {string} Formatted value
 */
function _formatMetricValue(value) {
  if (typeof value !== 'number') {
    return String(value);
  }

  // Format large numbers with separators
  if (value >= 1000) {
    return value.toLocaleString();
  }

  // Format decimals
  if (value % 1 !== 0) {
    return value.toFixed(2);
  }

  return String(value);
}

/**
 * Generate summary dashboard
 * 
 * @param {Object} data - Dashboard data
 * @returns {string} Summary output
 * 
 * @example
 * const summary = generateSummary({
 *   metrics: metricsCollector.getStats(),
 *   logs: logger.getStats()
 * });
 */
function generateSummary(data = {}) {
  // Handle null data
  if (!data) {
    data = {};
  }
  const { metrics = {}, logs = {} } = data;

  const lines = [];

  lines.push('═══ BYAN v2.0 Summary ═══');
  lines.push('');

  if (metrics.total !== undefined) {
    lines.push(`Metrics: ${metrics.total} total`);
    if (metrics.byType) {
      Object.entries(metrics.byType).forEach(([type, count]) => {
        lines.push(`  - ${type}: ${count}`);
      });
    }
  }

  lines.push('');

  if (logs.debug !== undefined || logs.info !== undefined) {
    const totalLogs = (logs.debug || 0) + (logs.info || 0) + (logs.warn || 0) + (logs.error || 0);
    lines.push(`Logs: ${totalLogs} total`);
    lines.push(`  - debug: ${logs.debug || 0}`);
    lines.push(`  - info: ${logs.info || 0}`);
    lines.push(`  - warn: ${logs.warn || 0}`);
    lines.push(`  - error: ${logs.error || 0}`);
  }

  return lines.join('\n');
}

module.exports = {
  printDashboard,
  generateSummary,
};
