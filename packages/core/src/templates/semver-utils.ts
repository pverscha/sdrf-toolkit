/**
 * Minimal semver constraint checker for template extends version validation.
 * Handles three forms:
 *   - "1.1.0"           — exact match
 *   - ">=1.1.0"         — lower bound (inclusive)
 *   - ">=1.1.0,<2.0.0"  — lower bound (inclusive) + upper bound (exclusive)
 *
 * Also supports >, <=, < operators for single-bound forms.
 */

function parseVer(v: string): [number, number, number] {
  const parts = v.split(".").map(s => parseInt(s, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function compareVer(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function satisfiesSingle(version: string, constraint: string): boolean {
  const ver = parseVer(version);
  if (constraint.startsWith(">=")) {
    return compareVer(ver, parseVer(constraint.slice(2))) >= 0;
  } else if (constraint.startsWith(">")) {
    return compareVer(ver, parseVer(constraint.slice(1))) > 0;
  } else if (constraint.startsWith("<=")) {
    return compareVer(ver, parseVer(constraint.slice(2))) <= 0;
  } else if (constraint.startsWith("<")) {
    return compareVer(ver, parseVer(constraint.slice(1))) < 0;
  } else {
    // exact match
    return compareVer(ver, parseVer(constraint)) === 0;
  }
}

/**
 * Returns true if `version` satisfies the given `constraint` string.
 */
export function satisfiesConstraint(version: string, constraint: string): boolean {
  // Handle compound constraints like ">=1.1.0,<2.0.0"
  const parts = constraint.split(",").map(s => s.trim()).filter(Boolean);
  return parts.every(part => satisfiesSingle(version, part));
}
