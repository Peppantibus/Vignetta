/** Esegue al massimo `concurrency` lavori alla volta; gli altri aspettano in coda. */
export function createLimiter(concurrency: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const queue: (() => void)[] = []

  return async (task) => {
    if (active >= concurrency) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await task()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}
