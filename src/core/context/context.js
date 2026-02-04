/**
 * Context Layer for managing conversational context across agents
 * Provides a hierarchical structure for storing and retrieving context data
 * 
 * @class ContextLayer
 * @example
 * const ctx = new ContextLayer();
 * ctx.addLayer('user', { name: 'Yan', role: 'dev' });
 * const userData = ctx.getLayer('user');
 */
class ContextLayer {
  /**
   * Initialize a new ContextLayer instance
   */
  constructor() {
    this.layers = {};
  }

  /**
   * Add or update a context layer
   * @param {string} name - Layer name/identifier
   * @param {object} data - Layer data to store
   * @throws {Error} If name is not a string or data is not an object
   * @returns {void}
   */
  addLayer(name, data) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Layer name must be a non-empty string');
    }
    if (typeof data !== 'object' || data === null) {
      throw new Error('Layer data must be an object');
    }
    this.layers[name] = { ...data, _timestamp: Date.now() };
  }

  /**
   * Retrieve a specific context layer
   * @param {string} name - Layer name to retrieve
   * @returns {object|null} Layer data (deep copy) or null if not found
   */
  getLayer(name) {
    if (!this.layers[name]) {
      return null;
    }
    return JSON.parse(JSON.stringify(this.layers[name]));
  }

  /**
   * Get all context layers
   * @returns {object} All layers as a key-value object (deep copy)
   */
  getAllLayers() {
    return JSON.parse(JSON.stringify(this.layers));
  }

  /**
   * Remove a specific context layer
   * @param {string} name - Layer name to remove
   * @returns {boolean} True if layer was removed, false if not found
   */
  clearLayer(name) {
    if (this.layers[name]) {
      delete this.layers[name];
      return true;
    }
    return false;
  }

  /**
   * Serialize all layers to JSON string
   * @returns {string} JSON representation of all layers
   */
  serialize() {
    return JSON.stringify(this.layers);
  }

  /**
   * Clear all context layers
   * @returns {void}
   */
  clearAll() {
    this.layers = {};
  }
}

module.exports = ContextLayer;
