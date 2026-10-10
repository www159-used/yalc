import type { Problem, SupportedLanguage } from "./interface/Problem";
import { isDatabaseLanguage } from "./interface/Problem";
import { generateDbTemplate } from "./database/DbTemplate";
import { getLanguageStrategy } from "./language/LanguageStrategy";

/** Create an official solution stub. Examples are run by LeetCode, not appended as local drivers. */
export function generateTemplate(
  problem: Problem,
  options?: { language?: SupportedLanguage; fileBaseName?: string }
): string {
  const lang = options?.language ?? "typescript";
  if (isDatabaseLanguage(lang)) return generateDbTemplate(problem, lang);
  const strategy = getLanguageStrategy(lang);
  const snippet = strategy.getSnippetFromProblem(problem).trim() || strategy.todoPlaceholder;
  const header = [
    `${strategy.commentPrefix} ${problem.id}. ${problem.title}`,
    problem.difficulty ? `${strategy.commentPrefix} Difficulty: ${problem.difficulty}` : null,
    `${strategy.commentPrefix} https://leetcode.cn/problems/${problem.titleSlug}/`,
  ].filter(Boolean).join("\n");
  return `${strategy.mergeHeaderWithSnippet?.(header, snippet) ?? `${header}\n\n${snippet}`}\n`;
}
