/**
 * Worker for executing tasks asynchronously
 * Represents a single worker in the pool
 * 
 * @class Worker
 */
class Worker {
  /**
   * Create a new Worker
   * @param {number} id - Unique worker identifier
   */
  constructor(id) {
    this.id = id;
    this.status = 'idle'; // idle, busy, error
    this.currentTask = null;
  }

  /**
   * Execute a task
   * @param {Function|object} task - Task to execute (function or object with execute method)
   * @returns {Promise<*>} Task result
   */
  async execute(task) {
    this.status = 'busy';
    this.currentTask = task;

    try {
      let result;
      
      if (typeof task === 'function') {
        result = await task();
      } else if (task && typeof task.execute === 'function') {
        result = await task.execute();
      } else {
        throw new Error('Task must be a function or have an execute method');
      }

      this.status = 'idle';
      this.currentTask = null;
      return result;
    } catch (error) {
      this.status = 'error';
      this.currentTask = null;
      throw error;
    }
  }
}

/**
 * Worker Pool for managing parallel task execution
 * Provides a pool of workers with automatic task queuing
 * 
 * @class WorkerPool
 * @example
 * const pool = new WorkerPool(3);
 * const result = await pool.submitTask(async () => { return 'done'; });
 */
class WorkerPool {
  /**
   * Create a new WorkerPool
   * @param {number} maxWorkers - Maximum number of concurrent workers
   * @throws {Error} If maxWorkers is not a positive number
   */
  constructor(maxWorkers = 4) {
    if (typeof maxWorkers !== 'number' || maxWorkers < 1) {
      throw new Error('maxWorkers must be a positive number');
    }

    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.taskQueue = [];
    this.activeTasks = 0;
    this.isShutdown = false;

    // Initialize workers
    for (let i = 0; i < maxWorkers; i++) {
      this.workers.push(new Worker(i));
    }
  }

  /**
   * Submit a task to the pool
   * @param {Function|object} task - Task to execute
   * @returns {Promise<*>} Promise that resolves with task result
   */
  submitTask(task) {
    if (this.isShutdown) {
      return Promise.reject(new Error('Worker pool is shutdown'));
    }

    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this._processQueue();
    });
  }

  /**
   * Process the task queue
   * @private
   */
  async _processQueue() {
    // Find an idle worker
    const idleWorker = this.workers.find(w => w.status === 'idle');

    if (!idleWorker || this.taskQueue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.taskQueue.shift();
    this.activeTasks++;

    try {
      const result = await idleWorker.execute(task);
      this.activeTasks--;
      resolve(result);
      
      // Process next task if any
      if (this.taskQueue.length > 0) {
        this._processQueue();
      }
    } catch (error) {
      this.activeTasks--;
      reject(error);
      
      // Reset worker to idle on error
      idleWorker.status = 'idle';
      
      // Continue processing queue
      if (this.taskQueue.length > 0) {
        this._processQueue();
      }
    }
  }

  /**
   * Get number of active workers
   * @returns {number} Number of busy workers
   */
  getActiveWorkers() {
    return this.workers.filter(w => w.status === 'busy').length;
  }

  /**
   * Get number of idle workers
   * @returns {number} Number of idle workers
   */
  getIdleWorkers() {
    return this.workers.filter(w => w.status === 'idle').length;
  }

  /**
   * Get current queue size
   * @returns {number} Number of queued tasks
   */
  getQueueSize() {
    return this.taskQueue.length;
  }

  /**
   * Get pool statistics
   * @returns {object} Pool statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.length,
      activeWorkers: this.getActiveWorkers(),
      idleWorkers: this.getIdleWorkers(),
      queueSize: this.getQueueSize(),
      activeTasks: this.activeTasks
    };
  }

  /**
   * Shutdown the pool gracefully
   * Waits for active tasks to complete
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.isShutdown = true;

    // Wait for all active tasks to complete
    while (this.activeTasks > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Clear queue and reject pending tasks
    while (this.taskQueue.length > 0) {
      const { reject } = this.taskQueue.shift();
      reject(new Error('Worker pool shutdown'));
    }
  }
}

module.exports = { WorkerPool, Worker };
