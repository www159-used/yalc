/** Judge verdict and optional measurements returned by LeetCode. */
export interface SubmissionResult {
  status: string;
  runSuccess?: boolean;
  compileError?: string;
  runtimeError?: string;
  passedTestCaseCnt?: number;
  totalTestCaseCnt?: number;
  runtime?: string;
  memory?: string;
  runtimePercentile?: number;
  memoryPercentile?: number;
  language?: string;
}
