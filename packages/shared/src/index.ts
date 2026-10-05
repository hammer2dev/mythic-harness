export * from "./api.js";
export { resolveSafeEndpointHostname } from "./endpointHostname.js";
export {
  RUNTIME_ZCODE_DEBUG,
  ZCODE_APP_VERSION_ENV,
  ZCODE_ARMS_RUM_ENDPOINT,
  ZCODE_BUILD_COMMIT_ID_ENV,
  ZCODE_ENV,
  ZCODE_PRODUCT_FLAVOR,
  ZCODE_TELEMETRY_ENABLED,
  ZCODE_TELEMETRY_REPORT_ENDPOINT,
  mapZCodeEnvToArmsRumEnv,
  normalizeZCodeEnv,
  normalizeZCodeProductFlavor,
} from "./env.js";
export type { ArmsRumEnv, ZCodeEnv, ZCodeProductFlavor } from "./env.js";
export * from "./errors.js";
export type { HelloAckMessage, HelloMessage } from "./handshake.js";
export { DEFAULT_LOCALE } from "./protocol.js";
export type {
  AppSettings,
  ElectronReleaseChannel,
  FileBinaryPreview,
  FileEntry,
  FileMediaPreview,
  FileStat,
  FileTextSlice,
  FileWatchEvent,
  HostResourceUsageProcess,
  IntegratedTerminalShellDialect,
  IntegratedTerminalShellOption,
  IntegratedTerminalShellSelection,
  Locale,
  LocalePreference,
  PersistedWorkspaceSessionEntry,
  RemoteTargetSnapshot,
  RemoteWorkspaceSessionEntry,
  ResourceUsageBaseGroupKey,
  ResourceUsageCategory,
  ResourceUsageProcess,
  ResourceUsageSnapshot,
  SystemInfo,
  TabId,
  TabState,
  WorkspaceFileEntry,
  WorkspaceProjectDefinition,
  WorkspaceProjectFolder,
  WorkspaceProjectScope,
  ZCodeInteractionBehavior,
} from "./protocol.js";
export type { RemoteAssetInstallMode } from "./remoteAssetInstallMode.js";
export { buildRemoteEnvironmentKey } from "./remoteEnvironmentKey.js";
export type {
  RemoteResourcePackageId,
  RemoteResourcePackageSelection,
} from "./remoteResourcePackages.js";
export { buildSshRemoteHostKey } from "./remoteSshHostKey.js";
export { stripRemoteTargetSecrets } from "./remoteTarget.js";
export type {
  DockerConnectOptions,
  RemoteTarget,
  SSHConnectOptions,
  WSLConnectOptions,
} from "./remoteTarget.js";
export * from "./rendererActionTrace.js";
export type { SessionCreateSource } from "./sessionCreateSource.js";
export {
  SHORTCUT_COMMANDS,
  getDefaultShortcutBindings,
  isValidShortcutBinding,
  normalizeShortcutKey,
  parseShortcutBinding,
  serializeShortcutBinding,
} from "./shortcutCommands.js";
export type {
  ParsedShortcutBinding,
  ShortcutChannel,
  ShortcutCommandEntry,
  ShortcutCommandId,
} from "./shortcutCommands.js";
export * from "./validation.js";
export { ZCODE_BUILD_TIME, ZCODE_COMMIT, ZCODE_VERSION } from "./version.js";
export type { WorkspacePurpose } from "./workspacePurpose.js";
export * from "./zcode-protocol/index.js";
// re-home：旧协议承重面的幸存文件（消费者继续走 barrel，零感知）
export * from "./conversation-message-projection-policy.js";
export * from "./conversation-preview-artifacts.js";
export * from "./dynamic-workflow-feature.js";
export * from "./markdown-artifact-images.js";
export * from "./media-preview.js";
export * from "./plugin-display-name.js";
export * from "./remote-workspace-identity.js";
export * from "./runtimeEnv.js";
export * from "./server-remote.js";
export * from "./serviceAuthority.js";
export * from "./task-realtime-core.js";
export * from "./zcode-agent-policy.js";
export * from "./zcode-agent-runtime.js";
export * from "./zcode-api-retry-status.js";
export * from "./zcode-media-policy.js";
export * from "./zcode-network-debug-status.js";
export * from "./zcode-protocol-legacy-types.js";
export * from "./zcode-session-task-status.js";
export * from "./zcode-session-visible-content.js";
export * from "./zcode-slash-command-help.js";
export * from "./zcode-source-headers.js";
export * from "./zcode-task-types-core.js";
export * from "./zcode-tool-projection-memory.js";
export * from "./zcodeEndpoint.js";

export interface ICredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export * from "./app-runtime-preferences.js";
export * from "./assistant-message-parts.js";
export * from "./assistant-presentation.js";
export * from "./automation-types.js";
export * from "./background-bash-jobs.js";
export * from "./background-task-control-merge.js";
export * from "./background-task-controls.js";
export * from "./background-task-notifications.js";
export * from "./bots.js";
export * from "./browser-use/index.js";
export * from "./channels.js";
export * from "./command-types.js";
export * from "./custom-model-value.js";
export * from "./desktopMenu.js";
export * from "./e2e-test-bridge.js";
export * from "./feedback.js";
export * from "./forceUpdate.js";
export * from "./git.js";
export * from "./helpAppConfig.js";
export * from "./hooks.js";
export * from "./intranetDefaults.js";
export * from "./intranetProbe.js";
export { LAUNCH_MARKS_QUERY_KEY, parseLaunchMarks, serializeLaunchMarks } from "./launchMarks.js";
export type { LaunchMarks } from "./launchMarks.js";
export * from "./lineChangeStat.js";
export { formatLogPrefix, formatTimestamp } from "./log-format.js";
export * from "./mcp-sync.js";
export * from "./mcp.js";
export * from "./model-provider-types.js";
export * from "./model-selection-key.js";
export * from "./model-selection-types.js";
export * from "./model-selection.js";
export * from "./official-glm-model-id.js";
export * from "./onboardingRecord.js";
export * from "./openrouter-attribution.js";
export * from "./permission-request-preview.js";
export {
  BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS,
  BROWSER_VIEW_RESTORE_BOOTSTRAP_URL,
  DesktopCommandIds,
  LOCAL_MEDIA_PREVIEW_SCHEME,
  buildLocalMediaPreviewUrl,
  createOpenInEditorRemoteTarget,
} from "./platform.js";
export type {
  ApplicationIconInfo,
  ApplicationIconLocator,
  ApplicationIconRequest,
  BindRemoteWorkspaceSessionContextRequest,
  BotRemoteWorkspaceReconnectedEvent,
  BrowserGuestAttachRejectReason,
  BrowserGuestAttachResult,
  BrowserTabResidencyState,
  BrowserViewCloseTabNotification,
  BrowserViewCloseTabRequest,
  BrowserViewOperationPayload,
  BrowserViewResidencyReportPayload,
  BrowserViewResidencyTransitionPayload,
  BrowserViewRestoreTabsRequest,
  BrowserViewRestoredTabShell,
  BrowserViewScreenshotSurfacePreparePayload,
  BrowserViewScreenshotSurfaceReadyPayload,
  BrowserViewScreenshotSurfaceReleasePayload,
  BrowserViewViewportChangedPayload,
  CancelPendingRemoteConnectionRequest,
  ChromeBrowserDataImportError,
  ChromeBrowserDataImportOptions,
  ChromeBrowserDataImportResult,
  ConnectRemoteRequest,
  CreateTempTextAttachmentRequest,
  CreateTempTextAttachmentResult,
  DesktopCommandId,
  DesktopTitleBarTheme,
  DesktopWindowChromeState,
  // preload 从公共入口导入缩放类型，遗漏导出会导致类型解析失败。
  DesktopZoomState,
  DockerContainerInfo,
  EditorInfo,
  EmbeddedBrowserDataClearResult,
  EmbeddedBrowserOpenUrlRequest,
  IPlatformService,
  OpenInEditorOptions,
  OpenInEditorRemoteTarget,
  PostUpdateReleaseNotesPayload,
  PrintPageToPdfResult,
  RemoteConnectionRuntimeLog,
  RemoteServiceSession,
  RemoteSessionClosedEvent,
  SSHConfigAliasOption,
  SaveFileRequest,
  SaveFileResult,
  TaskNotificationPayload,
  UpdateCheckResultPayload,
  UpdateStatePayload,
  WindowControlsOverlayMetrics,
  WindowControlsOverlayReadyPayload,
  WSLDistro,
  ZCodeStdioTapDevState,
} from "./platform.js";
export * from "./plugin-marketplaces.js";
export * from "./plugin-sync.js";
export * from "./plugin-types.js";
export * from "./process-names.js";
export * from "./provider-provisioning.js";
export * from "./remote-sync.js";
export * from "./remoteAppConfig.js";
export * from "./remoteAssetInstallMode.js";
export * from "./remoteResourcePackages.js";
export * from "./remoteUsageTelemetry.js";
export * from "./runtime-tool-runtime.js";
export * from "./sessionCreateTelemetry.js";
export * from "./settings-errors.js";
export * from "./settings-source.js";
export * from "./settings-sync.js";
export * from "./skill-scan-policy.js";
export * from "./skill-sync.js";
export * from "./skills-types.js";
export * from "./storage.js";
export * from "./streaming-tool-input-preview.js";
export * from "./subagents-types.js";
export * from "./task-realtime.js";
export {
  collectTelemetryRendererContext,
  resolveSafeTelemetryHostname,
  sanitizeTelemetryErrorMessage,
  sanitizeTelemetryEventDetail,
} from "./telemetry.js";
export type {
  ArmsCustomEventPayload,
  ConfigureFinalArmsCustomEventE2ERequest,
  FinalArmsCustomEventE2EEntry,
  FinalArmsCustomEventPayload,
  RendererTelemetryEventPayload,
  TelemetryEventPayload,
  TelemetryRendererContext,
} from "./telemetry.js";
export {
  TELEMETRY_SAFE_BUILTIN_MODEL_IDS,
  TELEMETRY_TEXT_MAX_LENGTH,
  redactTelemetryText,
  redactTelemetryUrl,
  resolveTelemetryModelId,
  resolveTelemetryProviderScope,
  sanitizeTelemetryModelValue,
} from "./telemetryRedaction.js";
export type {
  RedactTelemetryTextOptions,
  TelemetryProviderIdentity,
  TelemetryProviderScope,
} from "./telemetryRedaction.js";
export * from "./test-ids-workflow.js";
export * from "./test-ids.js";
export * from "./tool-call-summary.js";
export * from "./tool-identity.js";
export * from "./tool-plan-adapter.js";
export * from "./usage-stats.js";
export * from "./uuid.js";
export * from "./workspaceSessionRestore.js";
export * from "./zcode-agent-model-state.js";
export * from "./zcode-task-types.js";
export type { ZCodeTaskCreateResult } from "./zcode-task-types.js";
export * from "./zcodePersistedMessageMerge.js";
export * from "./database-startup.js";
export * from "./execution-state.js";
export * from "./memoryDiagnostics.js";
export * from "./processResourceTelemetry.js";
export {
  formatSubagentMarkdownModel,
  parseSubagentMarkdownSelection,
} from "./subagent-markdown-selection.js";

export { bashOutputDisplaySchema } from "./bash-output-display.js";

export * from "./clientConfig.js";
export { redactFeedbackText } from "./feedbackPrivacy.js";
export * from "./localTtft.js";
export * from "./pluginStoreOrder.js";
export * from "./pluginStoreOrdering.js";
export * from "./session-debug.js";
export * from "./project-workspace.js";

export * from "./credential-errors.js";
