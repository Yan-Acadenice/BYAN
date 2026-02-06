/**
 * Simple Cache with TTL support for reducing token consumption
 * Provides in-memory caching with automatic expiration
 * 
 * @class SimpleCache
 * @example
 * const cache = new SimpleCache();
 * cache.set('key1', 'value1', 5000); // TTL 5 seconds
 * const value = cache.get('key1');
 */
class SimpleCache {
  /**
   * Initialize a new SimpleCache instance
   */
  constructor() {
    this.store = new Map();
  }

  /**
   * Store a value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttl] - Time to live in milliseconds (optional)
   * @throws {Error} If key is not a string
   * @returns {void}
   */
  set(key, value, ttl) {
    if (typeof key !== 'string' || !key) {
      throw new Error('Cache key must be a non-empty string');
    }

    const entry = {
      value,
      timestamp: Date.now(),
      ttl: ttl || null
    };

    this.store.set(key, entry);
  }

  /**
   * Retrieve a value from cache
   * @param {string} key - Cache key
   * @returns {*|null} Cached value or null if not found or expired
   */
  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if TTL has expired
    if (entry.ttl && (Date.now() - entry.timestamp) > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Check if a key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists and not expired
   */
  has(key) {
    const value = this.get(key);
    return value !== null;
  }

  /**
   * Delete a specific cache entry
   * @param {string} key - Cache key to delete
   * @returns {boolean} True if key was deleted, false if not found
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   * @returns {void}
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get the number of entries in cache (includes expired but not cleaned)
   * @returns {number} Number of cache entries
   */
  size() {
    return this.store.size;
  }

  /**
   * Get all non-expired keys
   * @returns {string[]} Array of valid keys
   */
  keys() {
    const validKeys = [];
    for (const [key] of this.store) {
      if (this.get(key) !== null) {
        validKeys.push(key);
      }
    }
    return validKeys;
  }

  /**
   * Clean up expired entries
   * @returns {number} Number of entries removed
   */
  cleanup() {
    let removed = 0;
    for (const [key] of this.store) {
      if (this.get(key) === null) {
        removed++;
      }
    }
    return removed;
  }
}

module.exports = SimpleCache;
