const ContextLayer = require('../src/core/context/context');

describe('ContextLayer', () => {
  let ctx;

  beforeEach(() => {
    ctx = new ContextLayer();
  });

  describe('addLayer', () => {
    test('should add a new layer with data', () => {
      ctx.addLayer('user', { name: 'Yan', role: 'dev' });
      const layer = ctx.getLayer('user');
      expect(layer.name).toBe('Yan');
      expect(layer.role).toBe('dev');
      expect(layer._timestamp).toBeDefined();
    });

    test('should update existing layer', () => {
      ctx.addLayer('user', { name: 'Yan' });
      ctx.addLayer('user', { name: 'John' });
      const layer = ctx.getLayer('user');
      expect(layer.name).toBe('John');
    });

    test('should throw error for invalid name', () => {
      expect(() => ctx.addLayer('', { data: 'test' })).toThrow('Layer name must be a non-empty string');
      expect(() => ctx.addLayer(123, { data: 'test' })).toThrow('Layer name must be a non-empty string');
    });

    test('should throw error for invalid data', () => {
      expect(() => ctx.addLayer('test', null)).toThrow('Layer data must be an object');
      expect(() => ctx.addLayer('test', 'string')).toThrow('Layer data must be an object');
    });
  });

  describe('getLayer', () => {
    test('should retrieve existing layer', () => {
      ctx.addLayer('session', { id: '123', active: true });
      const layer = ctx.getLayer('session');
      expect(layer.id).toBe('123');
      expect(layer.active).toBe(true);
    });

    test('should return null for non-existent layer', () => {
      const layer = ctx.getLayer('nonexistent');
      expect(layer).toBeNull();
    });
  });

  describe('getAllLayers', () => {
    test('should return all layers', () => {
      ctx.addLayer('user', { name: 'Yan' });
      ctx.addLayer('session', { id: '123' });
      const allLayers = ctx.getAllLayers();
      expect(allLayers.user).toBeDefined();
      expect(allLayers.session).toBeDefined();
      expect(Object.keys(allLayers).length).toBe(2);
    });

    test('should return empty object when no layers', () => {
      const allLayers = ctx.getAllLayers();
      expect(allLayers).toEqual({});
    });

    test('should return a copy, not the original', () => {
      ctx.addLayer('user', { name: 'Yan' });
      const allLayers = ctx.getAllLayers();
      allLayers.user.name = 'Modified';
      expect(ctx.getLayer('user').name).toBe('Yan'); // Original unchanged
    });
  });

  describe('clearLayer', () => {
    test('should remove existing layer', () => {
      ctx.addLayer('temp', { data: 'test' });
      const result = ctx.clearLayer('temp');
      expect(result).toBe(true);
      expect(ctx.getLayer('temp')).toBeNull();
    });

    test('should return false for non-existent layer', () => {
      const result = ctx.clearLayer('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('serialize', () => {
    test('should serialize layers to JSON', () => {
      ctx.addLayer('user', { name: 'Yan', age: 30 });
      const json = ctx.serialize();
      const parsed = JSON.parse(json);
      expect(parsed.user.name).toBe('Yan');
      expect(parsed.user.age).toBe(30);
    });

    test('should serialize empty context', () => {
      const json = ctx.serialize();
      expect(json).toBe('{}');
    });
  });

  describe('clearAll', () => {
    test('should remove all layers', () => {
      ctx.addLayer('layer1', { data: 'test1' });
      ctx.addLayer('layer2', { data: 'test2' });
      ctx.clearAll();
      const allLayers = ctx.getAllLayers();
      expect(Object.keys(allLayers).length).toBe(0);
    });
  });

  describe('edge cases', () => {
    test('should handle special characters in layer names', () => {
      ctx.addLayer('layer-with-dash', { data: 'test' });
      ctx.addLayer('layer.with.dots', { data: 'test' });
      expect(ctx.getLayer('layer-with-dash')).toBeDefined();
      expect(ctx.getLayer('layer.with.dots')).toBeDefined();
    });

    test('should handle nested objects in data', () => {
      const nestedData = {
        user: {
          profile: {
            name: 'Yan',
            settings: { theme: 'dark' }
          }
        }
      };
      ctx.addLayer('complex', nestedData);
      const layer = ctx.getLayer('complex');
      expect(layer.user.profile.settings.theme).toBe('dark');
    });
  });
});
