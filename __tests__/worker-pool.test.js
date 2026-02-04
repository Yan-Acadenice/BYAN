const { WorkerPool, Worker } = require('../src/core/worker-pool/worker-pool');

describe('Worker', () => {
  let worker;

  beforeEach(() => {
    worker = new Worker(1);
  });

  test('should initialize with correct properties', () => {
    expect(worker.id).toBe(1);
    expect(worker.status).toBe('idle');
    expect(worker.currentTask).toBeNull();
  });

  test('should execute a function task', async () => {
    const task = async () => 'result';
    const result = await worker.execute(task);
    expect(result).toBe('result');
    expect(worker.status).toBe('idle');
  });

  test('should execute an object task with execute method', async () => {
    const task = {
      execute: async () => 'object result'
    };
    const result = await worker.execute(task);
    expect(result).toBe('object result');
  });

  test('should set status to busy during execution', async () => {
    const task = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'done';
    };

    const promise = worker.execute(task);
    expect(worker.status).toBe('busy');
    
    await promise;
    expect(worker.status).toBe('idle');
  });

  test('should handle task errors', async () => {
    const task = async () => {
      throw new Error('Task failed');
    };

    await expect(worker.execute(task)).rejects.toThrow('Task failed');
    expect(worker.status).toBe('error');
    expect(worker.currentTask).toBeNull();
  });

  test('should throw error for invalid task', async () => {
    await expect(worker.execute('not a function')).rejects.toThrow(
      'Task must be a function or have an execute method'
    );
  });

  test('should clear currentTask after completion', async () => {
    const task = async () => 'done';
    await worker.execute(task);
    expect(worker.currentTask).toBeNull();
  });
});

describe('WorkerPool', () => {
  let pool;

  beforeEach(() => {
    pool = new WorkerPool(3);
  });

  afterEach(async () => {
    if (!pool.isShutdown) {
      await pool.shutdown();
    }
  });

  describe('constructor', () => {
    test('should initialize with correct number of workers', () => {
      expect(pool.workers.length).toBe(3);
      expect(pool.maxWorkers).toBe(3);
    });

    test('should throw error for invalid maxWorkers', () => {
      expect(() => new WorkerPool(0)).toThrow('maxWorkers must be a positive number');
      expect(() => new WorkerPool(-1)).toThrow('maxWorkers must be a positive number');
      expect(() => new WorkerPool('invalid')).toThrow('maxWorkers must be a positive number');
    });

    test('should use default maxWorkers if not provided', () => {
      const defaultPool = new WorkerPool();
      expect(defaultPool.workers.length).toBe(4);
      defaultPool.shutdown();
    });
  });

  describe('submitTask', () => {
    test('should execute a single task', async () => {
      const result = await pool.submitTask(async () => 'result');
      expect(result).toBe('result');
    });

    test('should execute multiple tasks concurrently', async () => {
      const tasks = [
        pool.submitTask(async () => 'task1'),
        pool.submitTask(async () => 'task2'),
        pool.submitTask(async () => 'task3')
      ];

      const results = await Promise.all(tasks);
      expect(results).toEqual(['task1', 'task2', 'task3']);
    });

    test('should respect pool size limit', async () => {
      const delays = [50, 50, 50, 50]; // 4 tasks, pool size 3
      const startTime = Date.now();

      const tasks = delays.map((delay, i) =>
        pool.submitTask(async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          return `task${i}`;
        })
      );

      const results = await Promise.all(tasks);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(4);
      expect(duration).toBeGreaterThanOrEqual(90); // 2 batches needed
    });

    test('should queue tasks when pool is full', async () => {
      const task1 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'task1';
      });
      const task2 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'task2';
      });
      const task3 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'task3';
      });
      const task4 = pool.submitTask(async () => 'task4'); // Should be queued

      expect(pool.getQueueSize()).toBeGreaterThan(0);

      const results = await Promise.all([task1, task2, task3, task4]);
      expect(results).toContain('task4');
    });

    test('should handle task errors without stopping pool', async () => {
      const task1 = pool.submitTask(async () => {
        throw new Error('Task1 failed');
      });
      const task2 = pool.submitTask(async () => 'task2 success');

      await expect(task1).rejects.toThrow('Task1 failed');
      const result2 = await task2;
      expect(result2).toBe('task2 success');
    });

    test('should reject tasks after shutdown', async () => {
      await pool.shutdown();
      await expect(pool.submitTask(async () => 'task')).rejects.toThrow(
        'Worker pool is shutdown'
      );
    });
  });

  describe('getActiveWorkers', () => {
    test('should return 0 when no tasks are running', () => {
      expect(pool.getActiveWorkers()).toBe(0);
    });

    test('should return correct count during execution', async () => {
      const task1 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      });
      const task2 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'done';
      });

      // Wait a bit for tasks to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const activeCount = pool.getActiveWorkers();
      expect(activeCount).toBeGreaterThan(0);
      expect(activeCount).toBeLessThanOrEqual(3);

      await Promise.all([task1, task2]);
    });

    test('should never exceed maxWorkers', async () => {
      const tasks = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(
          pool.submitTask(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return `task${i}`;
          })
        );
      }

      // Check multiple times during execution
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(pool.getActiveWorkers()).toBeLessThanOrEqual(3);

      await new Promise(resolve => setTimeout(resolve, 30));
      expect(pool.getActiveWorkers()).toBeLessThanOrEqual(3);

      await Promise.all(tasks);
    });
  });

  describe('getIdleWorkers', () => {
    test('should return all workers when idle', () => {
      expect(pool.getIdleWorkers()).toBe(3);
    });

    test('should return correct count during execution', async () => {
      const task = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(pool.getIdleWorkers()).toBeLessThan(3);

      await task;
      expect(pool.getIdleWorkers()).toBe(3);
    });
  });

  describe('getStats', () => {
    test('should return correct statistics', async () => {
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(3);
      expect(stats.activeWorkers).toBe(0);
      expect(stats.idleWorkers).toBe(3);
      expect(stats.queueSize).toBe(0);
      expect(stats.activeTasks).toBe(0);
    });

    test('should update statistics during execution', async () => {
      const task1 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });
      const task2 = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      await new Promise(resolve => setTimeout(resolve, 10));
      const stats = pool.getStats();
      
      expect(stats.totalWorkers).toBe(3);
      expect(stats.activeWorkers).toBeGreaterThan(0);
      expect(stats.idleWorkers).toBeLessThan(3);

      await Promise.all([task1, task2]);
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully', async () => {
      const task = pool.submitTask(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'completed';
      });

      const shutdownPromise = pool.shutdown();
      const result = await task; // Task should complete
      
      await shutdownPromise;
      expect(pool.isShutdown).toBe(true);
      expect(result).toBe('completed');
    });

    test('should complete active tasks before shutdown', async () => {
      // Submit tasks
      const tasks = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(
          pool.submitTask(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return `task${i}`;
          })
        );
      }

      // Shutdown
      await pool.shutdown();
      
      // Pool should be shutdown
      expect(pool.isShutdown).toBe(true);
      
      // All tasks should complete successfully
      const results = await Promise.allSettled(tasks);
      const completed = results.filter(r => r.status === 'fulfilled');
      expect(completed.length).toBe(5);
    });

    test('should prevent new tasks after shutdown', async () => {
      await pool.shutdown();
      await expect(pool.submitTask(async () => 'new task')).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    test('should handle tasks that return undefined', async () => {
      const result = await pool.submitTask(async () => {
        // Explicitly return undefined
      });
      expect(result).toBeUndefined();
    });

    test('should handle tasks that return null', async () => {
      const result = await pool.submitTask(async () => null);
      expect(result).toBeNull();
    });

    test('should handle synchronous tasks', async () => {
      const result = await pool.submitTask(() => 'sync result');
      expect(result).toBe('sync result');
    });

    test('should handle complex return values', async () => {
      const complexResult = {
        data: [1, 2, 3],
        nested: { value: 'test' }
      };
      const result = await pool.submitTask(async () => complexResult);
      expect(result).toEqual(complexResult);
    });
  });
});
