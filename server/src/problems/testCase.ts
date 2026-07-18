export interface TestCase {
  input: string;
  expectedOutput: string;
}

export function parseTestCases(value: unknown): TestCase[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TestCase =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as TestCase).input === "string" &&
      typeof (item as TestCase).expectedOutput === "string",
  );
}
