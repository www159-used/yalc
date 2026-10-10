export interface RunResult {
  /** -1 means pending; 10 means the judge executed successfully, not necessarily a correct answer. */
  status: number;
  runOutput?: string;
  compileError?: string;
  runtimeError?: string;
  correctAnswer?: boolean;
  totalCorrect?: number;
  totalTestcases?: number;
  testcaseResults?: Array<{ id: number; status: boolean; stdout?: string; expectedOutput?: string }>;
}
