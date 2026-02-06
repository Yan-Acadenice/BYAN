const SimpleCache = require('../src/core/cache/cache');

describe('SimpleCache', () => {
  let cache;

  beforeEach(() => {
    cache = new SimpleCache();
  });

  describe('set and get', () => {
    test('should store and retrieve a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    test('should store different types of values', () => {
      cache.set('string', 'test');
      cache.set('number', 42);
      cache.set('object', { name: 'Yan' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get('string')).toBe('test');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toEqual({ name: 'Yan' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });

    test('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    test('should throw error for invalid key', () => {
      expect(() => cache.set('', 'value')).toThrow('Cache key must be a non-empty string');
      expect(() => cache.set(123, 'value')).toThrow('Cache key must be a non-empty string');
    });

    test('should overwrite existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });
  });

  describe('TTL functionality', () => {
    test('should return value before TTL expires', () => {
      cache.set('key1', 'value1', 1000); // 1 second TTL
      expect(cache.get('key1')).toBe('value1');
    });

    test('should return null after TTL expires', async () => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('key1')).toBeNull();
    });

    test('should support keys without TTL', () => {
      cache.set('permanent', 'value');
      expect(cache.get('permanent')).toBe('value');
    });

    test('should handle multiple keys with different TTLs', async () => {
      cache.set('short', 'value1', 100); // 100ms
      cache.set('long', 'value2', 1000); // 1s
      cache.set('permanent', 'value3');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('short')).toBeNull();
      expect(cache.get('long')).toBe('value2');
      expect(cache.get('permanent')).toBe('value3');
    });

    test('should clean up expired entry on access', async () => {
      cache.set('key1', 'value1', 50);
      expect(cache.size()).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      cache.get('key1'); // Trigger cleanup
      
      expect(cache.size()).toBe(0);
    });
  });

  describe('has', () => {
    test('should return true for existing key', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    test('should return false for non-existent key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    test('should return false for expired key', async () => {
      cache.set('key1', 'value1', 50);
      expect(cache.has('key1')).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('delete', () => {
    test('should delete existing key', () => {
      cache.set('key1', 'value1');
      const result = cache.delete('key1');
      expect(result).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    test('should return false for non-existent key', () => {
      const result = cache.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    test('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    test('should work on empty cache', () => {
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    test('should return correct size', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });

    test('should include expired entries until accessed', async () => {
      cache.set('key1', 'value1', 50);
      expect(cache.size()).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.size()).toBe(1); // Still counted
      
      cache.get('key1'); // Trigger cleanup
      expect(cache.size()).toBe(0);
    });
  });

  describe('keys', () => {
    test('should return all valid keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys.length).toBe(3);
    });

    test('should exclude expired keys', async () => {
      cache.set('valid', 'value1');
      cache.set('expired', 'value2', 50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const keys = cache.keys();
      expect(keys).toContain('valid');
      expect(keys).not.toContain('expired');
      expect(keys.length).toBe(1);
    });

    test('should return empty array for empty cache', () => {
      const keys = cache.keys();
      expect(keys).toEqual([]);
    });
  });

  describe('cleanup', () => {
    test('should remove expired entries', async () => {
      cache.set('key1', 'value1', 50);
      cache.set('key2', 'value2', 50);
      cache.set('key3', 'value3'); // No TTL
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const removed = cache.cleanup();
      expect(removed).toBe(2);
      expect(cache.keys().length).toBe(1);
      expect(cache.has('key3')).toBe(true);
    });

    test('should return 0 if no expired entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      const removed = cache.cleanup();
      expect(removed).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('should handle special characters in keys', () => {
      cache.set('key-with-dash', 'value1');
      cache.set('key.with.dots', 'value2');
      cache.set('key_with_underscore', 'value3');
      
      expect(cache.get('key-with-dash')).toBe('value1');
      expect(cache.get('key.with.dots')).toBe('value2');
      expect(cache.get('key_with_underscore')).toBe('value3');
    });

    test('should handle null and undefined values', () => {
      cache.set('null-value', null);
      cache.set('undefined-value', undefined);
      
      expect(cache.get('null-value')).toBeNull();
      expect(cache.get('undefined-value')).toBeUndefined();
    });

    test('should handle very short TTL', async () => {
      cache.set('key1', 'value1', 1); // 1ms TTL
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(cache.get('key1')).toBeNull();
    });
  });
});
