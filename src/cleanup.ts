/** Attempt every owned-resource cleanup before reporting failures. */
export function cleanup(...steps: (() => void)[]) {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Resource cleanup failed");
}
