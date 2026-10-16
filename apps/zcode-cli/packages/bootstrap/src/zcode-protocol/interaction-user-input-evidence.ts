import type { AskUserQuestion, TrustedUserAnswer } from "@zcode/contracts";

/** content 只允许传真实客户端响应的归一化结果，不能传带模型 answers 的完整 input。 */
export function buildTrustedUserAnswers(
  questions: readonly AskUserQuestion[],
  content: Record<string, unknown>,
): TrustedUserAnswer[] {
  const answers = content.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return [];
  const actual = answers as Record<string, unknown>;
  return questions.flatMap((question) => {
    const answer = actual[question.question];
    if (typeof answer !== "string" || !answer.trim()) return [];
    const selected = question.options.find((option) => option.label === answer);
    return [
      {
        question: question.question,
        answer,
        ...(selected
          ? { selectedOption: { label: selected.label, description: selected.description } }
          : {}),
      },
    ];
  });
}
