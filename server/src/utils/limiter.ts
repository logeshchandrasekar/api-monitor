/** Runs at most `max` async tasks at once; the rest wait in a FIFO queue. No dependencies. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    while (active < max && queue.length > 0) {
      active++;
      queue.shift()!();
    }
  };

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          // Promise.resolve().then() also catches a task that throws synchronously
          Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              active--;
              pump();
            });
        });
        pump();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}