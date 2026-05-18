export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function maxNumber(values: Iterable<number>, fallback = 0): number {
  let max = fallback;
  for (const value of values) {
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return max;
}

export function minNumber(values: Iterable<number>, fallback = 0): number {
  let min = fallback;
  for (const value of values) {
    if (Number.isFinite(value) && value < min) {
      min = value;
    }
  }
  return min;
}

export function maxNumberOr(values: Iterable<number>, fallback: number): number {
  let max = -Infinity;
  let found = false;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (!found || value > max) {
      max = value;
      found = true;
    }
  }
  return found ? max : fallback;
}

export function minNumberOr(values: Iterable<number>, fallback: number): number {
  let min = Infinity;
  let found = false;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (!found || value < min) {
      min = value;
      found = true;
    }
  }
  return found ? min : fallback;
}
