import type { Problem } from "../modules/interface/Problem";

/** All public example input lines, retaining argument order and case order from the API. */
export function publicExampleInput(problem: Pick<Problem, "exampleTestCases" | "sampleTestCase">): string {
  const examples = problem.exampleTestCases?.map(input => input.trim()).filter(Boolean);
  return examples?.length ? examples.join("\n") : problem.sampleTestCase;
}
