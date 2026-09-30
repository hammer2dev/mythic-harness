/* eslint-disable max-lines -- 推荐语料按表格逐条维护，集中放置便于对照审核。 */
import terminalIcon from "@/onboarding/assets/terminal.png";
import type { DraftSuggestedPromptItem } from "@/v4/draftSuggestedPromptItems.js";

const ASSETS = "https://cdn-zcode.z.ai/zcode/official-plugin/assets";

// 开发任务推荐；展示的按钮和正文中英文分别维护。
export const featureSuggestedPrompts: DraftSuggestedPromptItem[] = [
  {
    id: "feature-coding-repo-start",
    iconUrl: terminalIcon,
    label: {
      cn: "帮我看懂并运行当前仓库",
      en: "Help me understand and run this repository",
    },
    prompt: {
      cn: "帮我快速了解当前打开的仓库是做什么的、主要功能在哪里，以及在这台电脑上怎样启动它。请实际尝试运行一个最核心的流程，最后给我一份简明上手说明，标出关键文件、运行结果和遇到的阻碍；如果当前没有打开仓库，先让我选择一个。",
      en: "Help me understand what the open repository does, where its main features live, and how to run it on this computer. Try one core workflow, then give me a concise guide with key files, what ran successfully, and any blockers. If no repository is open, ask me to select one.",
    },
  },
  {
    id: "feature-coding-branch-review",
    iconUrl: `${ASSETS}/gitlab/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我检查当前分支提交前的问题",
      en: "Check this branch before I submit it",
    },
    prompt: {
      cn: "请检查当前打开的仓库里这个分支准备提交的改动。先确认它相对哪个目标分支，再结合改动涉及的功能找出明确的错误、兼容性风险和遗漏的边界；按严重程度告诉我问题、代码位置、触发方式和建议。如果没有发现可确认的问题，也说明检查了什么和仍需验证什么。",
      en: "Review the changes on the current branch of the open repository before I submit them. Identify the target branch, then look for concrete bugs, compatibility risks, and missed edge cases in the affected features. Rank findings by severity with code locations, triggers, and suggestions. If nothing is confirmed, tell me what was checked and what still needs verification.",
    },
  },
  {
    id: "feature-coding-check-failures",
    iconUrl: terminalIcon,
    label: {
      cn: "帮我运行项目现有检查并定位失败",
      en: "Run the existing checks and diagnose failures",
    },
    prompt: {
      cn: "帮我检查当前仓库现有的代码检查和测试能否通过。请优先运行项目已经配置、在当前环境可执行的检查；如果失败，定位最可能的原因，区分本分支引入的问题和原有问题，并给我可执行的修复建议。不要把没运行的检查写成通过，也先不要大范围改代码。",
      en: "Check whether the open repository’s existing code checks and tests pass. Run the checks already configured and feasible in this environment. For failures, identify likely causes, separate issues introduced by this branch from existing ones, and suggest actionable fixes. Do not call unrun checks passes or make broad code changes yet.",
    },
  },
  {
    id: "feature-coding-mr-summary",
    iconUrl: `${ASSETS}/gitlab/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我整理当前分支的 MR 描述",
      en: "Draft a merge request description for this branch",
    },
    prompt: {
      cn: "请根据当前仓库这个分支相对目标分支的实际改动，帮我写一份可以直接检查的 MR 描述：说明改动目的、用户可见的变化、主要实现、验证结果和已知风险。没有运行过的验证请明确标为未验证；如果目标分支不明确，先向我确认。先给我草稿，不要直接发布 MR。",
      en: "Draft a merge request description from this branch’s actual changes against its target branch. Cover the purpose, user-visible behavior, main implementation, verification results, and known risks. Mark checks that were not run as unverified. Ask me if the target branch is unclear. Show me the draft without publishing the MR.",
    },
  },
  {
    id: "feature-coding-dependencies",
    iconUrl: terminalIcon,
    label: {
      cn: "帮我检查仓库的依赖和升级风险",
      en: "Review this repository’s dependencies and upgrade risks",
    },
    prompt: {
      cn: "帮我检查当前仓库的主要依赖，找出已经过时、存在明确安全风险或阻碍后续升级的部分。结合项目实际使用情况，按优先级给我一份清单，说明影响、证据和建议的升级顺序；不要仅凭版本旧就判定有问题，也先不要批量升级。",
      en: "Review the open repository’s main dependencies for outdated packages, confirmed security risks, and likely upgrade blockers. Consider how this project actually uses them, then give me a prioritized list with impact, evidence, and a suggested upgrade order. Do not treat age alone as a defect or upgrade everything yet.",
    },
  },
  {
    id: "feature-recvvsWf8gXmsB",
    iconUrl: `${ASSETS}/github/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我设置一个闲时任务，全面验证仓库的测试覆盖",
      en: "Run a thorough test coverage review of a repository",
    },
    prompt: {
      cn: "帮我设置一个闲时任务，以 [目标仓库] 这个本地仓库为任务项目，全面检查关键功能的测试覆盖。运行当前环境支持的单元测试、集成测试和端到端测试，补齐重要缺口并复跑。最后给我一份详尽报告，列出覆盖范围、通过和失败项、无法运行的项目、证据及剩余风险。不要把未运行的测试写成通过；如果仓库未作为本地项目打开，先让我选择它。",
      en: "Set up an idle-time task for the local [target repository]. Review coverage of important features, run unit, integration, and end-to-end tests that the environment supports, add tests for important gaps, and rerun them. Deliver a detailed report of coverage, passes, failures, tests that could not run, evidence, and remaining risks. Never call an unrun test a pass. Ask me to select the repository if it is not open.",
    },
  },
  {
    id: "feature-recvvsWf8g0Cg0",
    iconUrl: `${ASSETS}/github/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我设置一个闲时任务，读透仓库并画出功能地图",
      en: "Read a repository deeply and map its features",
    },
    prompt: {
      cn: "帮我设置一个闲时任务，以 [目标仓库] 这个本地仓库为任务项目，系统梳理主要功能、模块职责、关键数据流和入口到结果的调用链。阅读必要的代码与文档，标出重要依赖、容易误解的边界和当前文档缺口，最后交付一份附文件位置的仓库导览和功能地图。没有代码依据的判断请标为推测；如果仓库未作为本地项目打开，先让我选择它。",
      en: "Set up an idle-time task for the local [target repository]. Map the main features, module responsibilities, data flows, and paths from entry point to result. Read the relevant code and docs, identify dependencies and confusing boundaries, and deliver a repository guide with file references. Label claims without code evidence as inference. Ask me to select the repository if it is not open.",
    },
  },
  {
    id: "feature-recvvsWf8grDkJ",
    iconUrl: `${ASSETS}/github/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我设置一个闲时任务，深查仓库潜在问题",
      en: "Find significant issues across a repository",
    },
    prompt: {
      cn: "帮我设置一个闲时任务，以 [目标仓库] 这个本地仓库为任务项目，全面检查关键用户流程和跨模块调用，找出可能导致功能错误、兼容性问题或数据丢失的缺陷。对高风险问题尽量复现并核对相关测试，最后按严重程度给我一份详尽报告，包含触发条件、代码位置、证据、修复建议及未验证假设。先不要大范围修改代码；如果仓库未作为本地项目打开，先让我选择它。",
      en: "Set up an idle-time task for the local [target repository]. Review important user journeys and cross-module calls for functional, compatibility, or data-loss issues. Reproduce high-risk findings where possible, check relevant tests, and deliver a detailed severity-ranked report with triggers, code locations, evidence, suggested fixes, and unverified hypotheses. Avoid broad code changes. Ask me to select the repository if it is not open.",
    },
  },
  {
    id: "feature-coding-browser-deployed",
    iconUrl: `${ASSETS}/browser-use/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我检查刚部署的网站有没有明显错误",
      en: "Check a deployed website for obvious problems",
    },
    prompt: {
      cn: "请使用 [@浏览器操作](plugin://browser-use@zcode-plugins-official) 打开 [测试地址]，像首次访问的用户一样检查首页导航、主要入口和一个无需登录即可完成的流程。找出无法打开的页面、失效操作或明显的内容与布局错误，附复现步骤、页面地址和截图。不要注册、付款或提交真实信息；登录后的部分标为未覆盖。",
      en: "Use [@Browser Use](plugin://browser-use@zcode-plugins-official) to open [test URL] and check its navigation, main entry points, and one flow available without signing in. Report broken pages, controls, content, or layout with reproduction steps, URLs, and screenshots. Do not register, pay, or submit real information; mark signed-in areas as not covered.",
    },
    plugin: {
      stableId: "browser-use@zcode-plugins-official",
      label: { cn: "浏览器操作", en: "Browser Use" },
    },
  },
  {
    id: "feature-coding-scheduled-ci",
    iconUrl: `${ASSETS}/gitlab/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "每天检查当前仓库有没有新的 CI 失败",
      en: "Check this repository for new CI failures daily",
    },
    prompt: {
      cn: "帮我为当前打开的仓库设置一个每个工作日上午 9 点运行的定时任务，查看远端过去 24 小时新增的 CI 失败。只报告仍需处理的失败，列出失败的流水线或任务、对应分支与提交、错误证据和建议的下一步；没有新的失败就简短说明。若仓库没有远端 CI 或运行环境无权访问，创建前先告诉我。",
      en: "Set up a scheduled task for 9 a.m. every workday for the open repository. Check its remote CI for failures newly seen in the past 24 hours. Report only failures that still need attention, with the pipeline or job, branch and commit, error evidence, and a next step. Give a brief all-clear if there are none. Tell me before creating the task if the repository has no remote CI or the scheduled environment cannot access it.",
    },
  },
  {
    id: "feature-coding-scheduled-weekly-changes",
    iconUrl: `${ASSETS}/gitlab/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "每周汇总当前仓库的改动和待处理风险",
      en: "Summarize this repository’s changes and risks weekly",
    },
    prompt: {
      cn: "帮我为当前打开的仓库设置一个每周五下午 5 点运行的定时任务，回顾这一周合入的改动和仍未解决的失败或阻塞。给我一份简短周报，按功能变化、验证情况和下周需要关注的风险整理，并附对应提交、MR 或 CI 链接。不要把尚未合入的改动写成已完成；如果任务运行环境无法访问仓库或远端，创建前先说明。",
      en: "Set up a scheduled task for 5 p.m. every Friday for the open repository. Review changes merged this week and failures or blockers still open. Send me a short update grouped by feature changes, verification, and risks to watch next week, with commit, merge request, or CI links. Do not call unmerged work complete. Tell me before creating the task if its environment cannot access the repository or remote.",
    },
  },
  {
    id: "feature-coding-idle-external-failures",
    iconUrl: `${ASSETS}/github/icon.png`,
    iconStyle: "plugin",
    label: {
      cn: "帮我设置闲时任务，深查外部服务失败路径",
      en: "Deeply review external-service failure paths in idle time",
    },
    prompt: {
      cn: "帮我设置一个闲时任务，以当前打开的本地仓库为项目，系统检查它调用的外部 API、数据库和第三方服务在超时、断连、限流与返回错误时会怎样影响关键用户流程。追到调用方和用户可见结果，尽量复现高风险缺口，最后按严重程度给我一份附代码位置、运行证据和修复建议的报告。不要把没有实际验证的风险写成已发生的故障，也先不要大范围修改代码；如果没有打开本地仓库，先让我选择一个。",
      en: "Set up an idle-time task for the open local repository. Trace how timeouts, disconnections, rate limits, and errors from external APIs, databases, and third-party services affect important user flows. Follow each path to the caller and user-visible result, reproduce high-risk gaps where feasible, and deliver a severity-ranked report with code locations, runtime evidence, and fixes. Do not present unverified risks as incidents or make broad code changes. Ask me to select a local repository if none is open.",
    },
  },
];

export function getRecommendedPromptPool(): DraftSuggestedPromptItem[] {
  return featureSuggestedPrompts;
}
