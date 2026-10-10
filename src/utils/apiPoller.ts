import type { RunResult } from "../modules/interface/RunResult";
import type { SubmissionResult } from "../modules/interface/SubmissionResult";

/**
 * Poll run status until terminal state or max tries.
 */
export async function pollRunStatus(
  getStatus: () => Promise<RunResult | null>,
  options: { maxTries?: number; intervalMs?: number } = {}
): Promise<RunResult | null> {
  const { maxTries = 20, intervalMs = 500 } = options;
  for (let i = 0; i < maxTries; i++) {
    const result = await getStatus();
    if (!result) return null;
    if (result.status !== -1) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Poll submit status until terminal state or max tries.
 */
export async function pollSubmitStatus(
  getStatus: () => Promise<SubmissionResult | null>,
  options: { maxTries?: number; intervalMs?: number } = {}
): Promise<SubmissionResult | null> {
  const { maxTries = 30, intervalMs = 500 } = options;
  for (let i = 0; i < maxTries; i++) {
    const result = await getStatus();
    if (!result) return null;
    if (result.status !== "PENDING" && result.status !== "STARTED") return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
