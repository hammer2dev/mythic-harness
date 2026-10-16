import type {
  JdkChangeIntent,
  TrustedUserAnswer,
  TurnId,
  UserIntentEvidencePort,
} from "@zcode/contracts";

/** 本轮明确用户输入的窄证据；不扫描 transcript，不信任模型生成的确认标志。 */
export class TurnUserIntentEvidence implements UserIntentEvidencePort {
  private turnId?: TurnId;
  private texts: string[] = [];
  private answers: TrustedUserAnswer[] = [];

  beginTurn(turnId: TurnId, realUserText?: string): void {
    this.turnId = turnId;
    this.texts = realUserText ? [realUserText] : [];
    this.answers = [];
  }

  recordUserText(turnId: TurnId, text: string): void {
    if (turnId === this.turnId) this.texts.push(text);
  }

  recordAnswers(turnId: TurnId, answers: readonly TrustedUserAnswer[]): void {
    if (turnId !== this.turnId) return;
    this.answers.push(...answers.filter((entry) => entry.answer.trim().length > 0));
  }

  allowsJdkChange(input: JdkChangeIntent): boolean {
    if (input.turnId !== this.turnId) return false;
    if (input.operation === "clearSelection") {
      if (input.scope !== "project") return false;
      return (
        this.texts.some((text) => permitsClearSelection(text, input.purpose)) ||
        this.answers.some((entry) => {
          if (permitsClearSelection(entry.answer, input.purpose)) return true;
          const choice = entry.selectedOption
            ? `${entry.selectedOption.label} ${entry.selectedOption.description}`
            : entry.answer;
          if (hasNegativeIntent(choice)) return false;
          const accepted =
            isAffirmative(entry.answer) ||
            (entry.selectedOption !== undefined && hasClearSelectionAction(choice));
          return accepted && permitsClearSelection(`${entry.question} ${choice}`, input.purpose);
        })
      );
    }
    if (!input.path?.trim()) return false;
    const change = { ...input, path: input.path };
    if (input.operation === "select" ? input.scope !== "project" : input.scope !== "environment") {
      return false;
    }
    return (
      this.texts.some((text) => permitsChange(text, change)) ||
      this.answers.some((entry) => {
        if (permitsChange(entry.answer, change)) return true;
        // 问题是模型提出的，只有实际选择了该可见选项或明确肯定回答才能借用其语境。
        const choice = entry.selectedOption
          ? `${entry.selectedOption.label} ${entry.selectedOption.description}`
          : entry.answer;
        const choiceIntent = withoutPath(choice, change.path);
        if (
          hasNegativeIntent(choiceIntent) ||
          /稍后|暂缓|取消|跳过|\b(?:cancel|skip|later)\b/i.test(choiceIntent)
        )
          return false;
        if (input.operation === "select" && /自动|\bauto(?:matic)?\b/i.test(choiceIntent))
          return false;
        const accepted =
          containsPath(choice, change.path) ||
          isAffirmative(entry.answer) ||
          (entry.selectedOption !== undefined && hasOperation(choiceIntent, input.operation));
        return accepted && permitsChange(`${entry.question} ${choice}`, change);
      })
    );
  }
}

function permitsChange(text: string, input: JdkChangeIntent & { path: string }): boolean {
  // 只看包含目标路径的语句，避免其它句子的操作意图串到这个路径。
  return text.split(/[\n。；;]/).some((statement) => {
    if (!containsPath(statement, input.path)) return false;
    const intent = withoutPath(statement, input.path);
    if (hasNegativeIntent(intent)) return false;
    if (input.operation === "register") {
      if (hasOperation(intent, "forget")) return false;
      return (
        hasOperation(intent, "register") ||
        !(/项目|工作区|\b(?:project|workspace)\b/i.test(intent) && hasOperation(intent, "select"))
      );
    }
    if (!hasOperation(intent, input.operation)) return false;
    if (input.operation === "select" && input.purpose === "build") {
      return /构建|Gradle|\bbuild(?: JVM)?\b/i.test(intent);
    }
    return input.operation === "forget" || /项目|工作区|\b(?:project|workspace)\b/i.test(intent);
  });
}

function permitsClearSelection(text: string, purpose: JdkChangeIntent["purpose"]): boolean {
  return text.split(/[\n。；;]/).some((statement) => {
    if (hasNegativeIntent(statement) || !hasClearSelectionAction(statement)) return false;
    if (
      !/当前(?:项目|工作区)|(?:本|此|这个)(?:项目|工作区)|\b(?:current|this)\s+(?:project|workspace)\b/i.test(
        statement,
      )
    )
      return false;
    if (!/JDK|Java|JVM/i.test(statement)) return false;
    const build = /构建|Gradle|\bbuild(?: JVM)?\b/i.test(statement);
    return purpose === "build" ? build : !build;
  });
}

function hasClearSelectionAction(text: string): boolean {
  return (
    /清除|取消|解除|清空|重置|\b(?:clear|reset|unpin)\b/i.test(text) &&
    /固定|绑定|选择|\b(?:pin|unpin|selection|binding)\b/i.test(text)
  );
}

function hasOperation(text: string, operation: JdkChangeIntent["operation"]): boolean {
  if (operation === "register")
    return /保存|记住|登记|添加|\b(?:save|remember|register|add)\b/i.test(text);
  if (operation === "forget")
    return /移除|删除|忘记|取消登记|\b(?:forget|remove|unregister)\b/i.test(text);
  return /固定|绑定|使用|选用|选择|设为|\b(?:pin|bind|use|select|set)\b/i.test(text);
}

function isAffirmative(text: string): boolean {
  return /^(?:是|是的|好|好的|确认|同意|可以|yes|ok|confirm)[。.!！]?$/i.test(text.trim());
}

function hasNegativeIntent(text: string): boolean {
  return /不要|不需要|不允许|不固定|不使用|不选择|不删除|不移除|不(?:清除|取消|解除|清空|重置)|别(?:用|设|删|移|固|清|取消|解除|重置)|\b(?:no|not|never|don't|do not)\b/i.test(
    text,
  );
}

function containsPath(text: string, path: string): boolean {
  return pathPattern(path).test(text.replaceAll("\\", "/"));
}

function withoutPath(text: string, path: string): string {
  return text.replaceAll("\\", "/").replace(pathPattern(path), " ");
}

function pathPattern(path: string): RegExp {
  const normalizedPath = path.trim().replaceAll("\\", "/").replace(/\/$/, "");
  const escaped = normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const windowsPath = /^[a-z]:\//i.test(normalizedPath);
  return new RegExp(`(?<![\\w/.-])${escaped}(?![\\w/.-])`, windowsPath ? "gi" : "g");
}
