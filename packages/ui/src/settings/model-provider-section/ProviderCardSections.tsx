/* eslint-disable max-lines -- 模型供应商卡片仍在迁移期集中维护多个紧耦合区块，后续拆分时再移除。 */
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type {
  ProviderSettingsFormProvider,
  ProviderSettingsFormModel,
} from "@/lib/providerSettingsFormTypes.js";
import type { ModelConnectivityResult } from "@zcode/shared";
import type { ModelConfigResolution, ProviderApiType } from "@zcode/provider";
import {
  TID_MODEL_PROVIDER_ADD_MODEL_BUTTON,
  TID_MODEL_PROVIDER_BASE_URL_INPUT,
  TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON,
  TID_MODEL_PROVIDER_MODEL_INPUT,
  TID_MODEL_PROVIDER_NAME_EDIT_BUTTON,
  TID_MODEL_PROVIDER_NAME_INPUT,
  testId,
} from "@zcode/shared/test-ids";
import {
  ArrowLeft,
  InfoIcon,
  LockKeyholeIcon,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { TECHNICAL_INPUT_ATTRIBUTES } from "@/lib/technicalInputAttributes.js";
import { ApiKeyInput } from "./ApiKeyInput.js";
import { ModelRowInput } from "./ProviderFormControls.js";
import { PresetProviderApiKeyBanner } from "./PresetProviderApiKeyBanner.js";
import {
  PROVIDER_CONNECTION_API_FORMATS,
  ProviderApiFormatSelect,
  resolveProviderConnectionApiFormatDisplayLabel,
} from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { SortableProviderModelList } from "@/settings/model-provider-section/SortableProviderModelList.js";
import { ProviderLogo } from "@/settings/model-provider-section/ProviderLogo.js";
import type { ProviderConfigObject } from "@zcode/provider";

export {
  resolveProviderConnectionApiFormatDisplayLabel,
  resolveProviderConnectionApiFormatOptions,
} from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
export { formatModelContextWindowLabel } from "@/lib/tokenNumberFormat.js";

export function resolveProviderApiFormatOptions(
  _provider: Pick<ProviderSettingsFormProvider, "config" | "models">,
): ProviderApiType[] {
  return [...PROVIDER_CONNECTION_API_FORMATS];
}

export function shouldShowProviderApiFormat(
  _provider: Pick<ProviderSettingsFormProvider, "providerId">,
): boolean {
  return true;
}

export function ProviderCardHeader({
  providerName,
  logo,
  editingName,
  nameValue,
  nameEditable = true,
  onNameChange,
  onNameBlur,
  onNameKeyDown,
  onNameCompositionEnd,
  onNameCompositionStart,
  onStartEditName,
  onDelete,
  actionsVisible = true,
  providerToggle,
}: {
  providerName: string;
  logo?: ProviderConfigObject["logo"];
  editingName: boolean;
  nameValue: string;
  nameEditable?: boolean;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
  onNameKeyDown: (event: ReactKeyboardEvent) => void;
  onNameCompositionEnd?: () => void;
  onNameCompositionStart?: () => void;
  onStartEditName: () => void;
  onDelete?: () => void;
  actionsVisible?: boolean;
  providerToggle?: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  const renameRequestedRef = useRef(false);
  const secondaryActionsVisible = actionsVisible && (nameEditable || Boolean(onDelete));

  return (
    <header className="flex items-center justify-between gap-3" data-testid="model-provider-header">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground-subtle">
          <ProviderLogo logo={logo} className="size-6" />
        </span>
        {editingName ? (
          <Input
            {...TECHNICAL_INPUT_ATTRIBUTES}
            autoFocus
            data-testid={TID_MODEL_PROVIDER_NAME_INPUT}
            type="text"
            size="lg"
            className="w-auto min-w-0 text-ui-lg font-semibold"
            value={nameValue}
            onChange={(event) => onNameChange(event.target.value)}
            onCompositionEnd={onNameCompositionEnd}
            onCompositionStart={onNameCompositionStart}
            onBlur={onNameBlur}
            onKeyDown={onNameKeyDown}
          />
        ) : (
          <h3 className="min-w-0 break-words text-ui-xl font-semibold leading-snug text-foreground">
            {providerName}
          </h3>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {providerToggle}
        {secondaryActionsVisible ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid="model-provider-actions-button"
                aria-label={intl.formatMessage({ id: "common.more" })}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                // 退场动画中的菜单仍会因鼠标移动抢焦点，必须关闭后再挂载并聚焦输入框。
                if (renameRequestedRef.current) {
                  event.preventDefault();
                  renameRequestedRef.current = false;
                  onStartEditName();
                }
              }}
            >
              {nameEditable ? (
                <DropdownMenuItem
                  data-testid={TID_MODEL_PROVIDER_NAME_EDIT_BUTTON}
                  onSelect={() => {
                    renameRequestedRef.current = true;
                  }}
                >
                  <Pencil className="size-3.5" />
                  {intl.formatMessage({ id: "settings.modelProvider.renameProvider" })}
                </DropdownMenuItem>
              ) : null}
              {nameEditable && onDelete ? <DropdownMenuSeparator /> : null}
              {onDelete ? (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 className="size-3.5" />
                  {intl.formatMessage({ id: "common.delete" })}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}

export function ProviderConnectionSection({
  provider,
  readOnly,
  apiFormat,
  baseUrlValue,
  onApiFormatChange,
  onBaseUrlChange,
  onBaseUrlBlur,
  onBaseUrlKeyDown,
  onBaseUrlCompositionStart,
  onBaseUrlCompositionEnd,
}: {
  provider: ProviderSettingsFormProvider;
  readOnly?: boolean;
  apiFormat: ProviderApiType;
  baseUrlValue: string;
  onApiFormatChange: (value: ProviderApiType) => void;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlBlur: () => void;
  onBaseUrlKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onBaseUrlCompositionStart?: () => void;
  onBaseUrlCompositionEnd?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const baseUrlId = useId();
  const apiFormatId = useId();
  const showApiFormat = shouldShowProviderApiFormat(provider);
  const readOnlyBaseUrl = provider.config.api?.baseUrl ?? "";
  const resolvedApiFormat = provider.config.api?.type ?? "anthropic-messages";

  const renderReadOnlyField = (label: string, value: string) => (
    <div>
      <label className="mb-1 block text-ui-base text-foreground-subtle">{label}</label>
      <div className="flex min-h-8 items-center gap-2 rounded-lg border border-input-border bg-input px-3 py-1.5 text-ui-base text-foreground">
        <span className="min-w-0 flex-1 break-all">{value || "-"}</span>
        <span
          role="img"
          aria-label={intl.formatMessage(
            { id: "settings.modelProvider.readOnlyField" },
            { field: label },
          )}
          className="shrink-0 text-foreground-subtle"
        >
          <LockKeyholeIcon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  if (readOnly) {
    return (
      <>
        {renderReadOnlyField(
          intl.formatMessage({ id: "settings.modelProvider.baseUrl" }),
          readOnlyBaseUrl,
        )}
        {showApiFormat
          ? renderReadOnlyField(
              intl.formatMessage({ id: "settings.modelProvider.apiFormat" }),
              resolveProviderConnectionApiFormatDisplayLabel(intl, resolvedApiFormat),
            )
          : null}
      </>
    );
  }

  return (
    <>
      <div>
        <label htmlFor={baseUrlId} className="mb-1.5 block text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.baseUrl" })}
        </label>
        <Input
          {...TECHNICAL_INPUT_ATTRIBUTES}
          id={baseUrlId}
          type="text"
          size="lg"
          data-testid={TID_MODEL_PROVIDER_BASE_URL_INPUT}
          value={baseUrlValue}
          placeholder={intl.formatMessage({
            id: "settings.modelProvider.baseUrlPlaceholder",
          })}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          onBlur={onBaseUrlBlur}
          onKeyDown={onBaseUrlKeyDown}
          onCompositionStart={onBaseUrlCompositionStart}
          onCompositionEnd={onBaseUrlCompositionEnd}
        />
      </div>
      {showApiFormat ? (
        <div>
          <label htmlFor={apiFormatId} className="mb-1.5 block text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.modelProvider.apiFormat" })}
          </label>
          <ProviderApiFormatSelect
            value={apiFormat}
            onChange={onApiFormatChange}
            triggerId={apiFormatId}
          />
        </div>
      ) : null}
    </>
  );
}

export function ProviderApiKeySection({
  apiKeyValue,
  apiKeyVisible,
  readOnly,
  presetApiKeyUrl,
  onOpenPresetApiKey,
  onApiKeyChange,
  onApiKeyBlur,
  onApiKeyKeyDown,
  onApiKeyCompositionStart,
  onApiKeyCompositionEnd,
  onToggleApiKeyVisibility,
}: {
  apiKeyValue: string;
  apiKeyVisible: boolean;
  readOnly?: boolean;
  presetApiKeyUrl?: string;
  onOpenPresetApiKey?: () => void;
  onApiKeyChange: (value: string) => void;
  onApiKeyBlur: () => void;
  onApiKeyKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onApiKeyCompositionStart?: () => void;
  onApiKeyCompositionEnd?: () => void;
  onToggleApiKeyVisibility: () => void;
}) {
  const { intl } = useZCodeIntl();
  const apiKeyId = useId();

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={apiKeyId} className="block text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.apiKey" })}
        </label>
        {presetApiKeyUrl && onOpenPresetApiKey ? (
          <PresetProviderApiKeyBanner onOpenApiKey={onOpenPresetApiKey} />
        ) : null}
      </div>
      <ApiKeyInput
        id={apiKeyId}
        value={apiKeyValue}
        visible={apiKeyVisible}
        readOnly={readOnly}
        onChange={onApiKeyChange}
        onBlur={onApiKeyBlur}
        onKeyDown={onApiKeyKeyDown}
        onCompositionStart={onApiKeyCompositionStart}
        onCompositionEnd={onApiKeyCompositionEnd}
        onToggleVisibility={onToggleApiKeyVisibility}
      />
    </div>
  );
}

function createEmptyModel(): ProviderSettingsFormModel {
  return {
    kind: "candidate",
    modelId: "",
    builtin: false,
    personalConfig: {},
    // 空 ID 尚未解析模型配置，硬编码档位会被误认为智能推荐。
    config: {
      properties: { supportsToolCall: true },
    },
    hasPersonalConfig: false,
    executable: false,
    selectable: false,
  };
}

export function ProviderModelsSection({
  providerId,
  providerName,
  providerEnabled = true,
  providerAccess,
  models,
  onTestModel,
  onModelCommit,
  onModelEnabledChange,
  onDeleteModel,
  onAddModel,
  prepareCatalogConnection,
  onListDraftModels,
  onResolveDraftModel,
  catalogConnection,
  onReorderModelIds,
  settingsRevision = 0,
}: {
  providerId: string;
  providerName?: string;
  providerEnabled?: boolean;
  providerAccess?: ProviderConfigObject["access"];
  models: ProviderSettingsFormModel[];
  onTestModel?: (model: string) => Promise<ModelConnectivityResult>;
  onModelCommit: (
    originalModelId: string,
    model: ProviderSettingsFormModel,
    basedOnRevision: number,
  ) => void | Promise<void>;
  onDeleteModel: (modelId: string) => void;
  onModelEnabledChange?: (modelId: string, enabled: boolean) => void | Promise<void>;
  onAddModel: (model: ProviderSettingsFormModel) => void | Promise<void>;
  prepareCatalogConnection?: () => Promise<void>;
  onListDraftModels?: () => Promise<string[]>;
  onResolveDraftModel?: (
    originalModelId: string,
    nextModelId: string,
    personalConfig: ProviderSettingsFormModel["personalConfig"],
  ) => Promise<ModelConfigResolution>;
  catalogConnection?: {
    apiFormat: ProviderApiType;
    baseUrlValue: string;
    apiKeyValue: string;
    headers?: Readonly<Record<string, string>> | null;
  };
  onReorderModelIds?: (modelIds: string[]) => void;
  settingsRevision?: number;
}) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService } = useServices();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const catalogHeadersKey = JSON.stringify(catalogConnection?.headers);
  const catalogKey = useMemo(
    () => ({
      providerId,
      providerSettingsService,
      apiFormat: catalogConnection?.apiFormat,
      baseUrl: catalogConnection?.baseUrlValue,
      apiKey: catalogConnection?.apiKeyValue,
      headers: catalogHeadersKey,
    }),
    [
      providerId,
      providerSettingsService,
      catalogConnection?.apiFormat,
      catalogConnection?.baseUrlValue,
      catalogConnection?.apiKeyValue,
      catalogHeadersKey,
    ],
  );
  const [catalogResult, setCatalogResult] = useState<{
    key: object;
    ids: string[];
    status: "loading" | "ready" | "error";
  }>();
  const activeCatalog = catalogResult?.key === catalogKey ? catalogResult : undefined;
  const catalogKeyRef = useRef(catalogKey);
  catalogKeyRef.current = catalogKey;
  const catalogFlight = useRef<object | null>(null);
  const catalogLoading = activeCatalog?.status === "loading";
  const catalogError = activeCatalog?.status === "error";
  const loadCatalog = async () => {
    if (
      catalogFlight.current === catalogKey ||
      (!onListDraftModels && !providerSettingsService.listAvailableModels)
    )
      return;
    catalogFlight.current = catalogKey;
    setCatalogResult({ key: catalogKey, status: "loading", ids: [] });
    try {
      await prepareCatalogConnection?.();
      if (catalogKeyRef.current !== catalogKey) return;
      const ids = onListDraftModels
        ? await onListDraftModels()
        : await providerSettingsService.listAvailableModels?.(providerId);
      if (catalogKeyRef.current === catalogKey)
        setCatalogResult({ key: catalogKey, status: "ready", ids: ids ?? [] });
    } catch {
      if (catalogKeyRef.current === catalogKey)
        setCatalogResult({ key: catalogKey, status: "error", ids: [] });
    } finally {
      if (catalogFlight.current === catalogKey) catalogFlight.current = null;
    }
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ui-lg font-semibold text-foreground">
          {intl.formatMessage({ id: "settings.modelProvider.models" })}
        </h3>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {providerAccess?.type === "api-key" &&
          (onListDraftModels || providerSettingsService.listAvailableModels) ? (
            <Button
              variant="outline"
              size="lg"
              disabled={catalogLoading}
              data-testid="model-catalog-fetch"
              onClick={() => void loadCatalog()}
            >
              {intl.formatMessage({
                id: catalogLoading ? "common.loading" : "settings.modelProvider.catalog.fetch",
              })}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="default"
            size="lg"
            className="rounded-lg"
            data-testid={TID_MODEL_PROVIDER_ADD_MODEL_BUTTON}
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.modelProvider.addModel" })}
          </Button>
        </div>
      </div>
      {catalogError ? (
        <p role="alert" className="mb-2 text-ui-sm text-destructive">
          {intl.formatMessage({ id: "settings.modelProvider.catalog.loadFailed" })}
        </p>
      ) : null}
      {activeCatalog?.status === "ready" ? (
        <p
          role="status"
          className="mb-2 text-ui-sm text-foreground-subtle"
          data-testid="model-catalog-status"
        >
          {activeCatalog.ids.length > 0
            ? intl.formatMessage(
                { id: "settings.modelProvider.catalog.ready" },
                { count: activeCatalog.ids.length },
              )
            : intl.formatMessage({ id: "settings.modelProvider.catalog.emptyDirectory" })}
        </p>
      ) : null}
      {models.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <SortableProviderModelList
            modelIds={models.map((model) => model.modelId)}
            sortableModelIds={models.map((model) => model.modelId)}
            onReorder={onReorderModelIds}
            renderModel={(_modelId, index) => {
              const model = models[index]!;
              const inputFormat = model.config.properties?.inputFormat;
              const outputFormat = model.config.properties?.outputFormat;
              const completeProperties =
                model.config.properties?.contextWindow != null &&
                inputFormat?.supportsText != null &&
                inputFormat.supportsImage != null &&
                inputFormat.supportsVideo != null &&
                inputFormat.supportsAudio != null &&
                inputFormat.supportsPdf != null &&
                outputFormat?.supportsText != null;
              return (
                <>
                  <ModelRowInput
                    key={`${providerId}/${model.modelId}`}
                    providerId={providerId}
                    providerName={providerName}
                    providerEnabled={providerEnabled}
                    providerAccess={providerAccess}
                    inputTestId={testId(TID_MODEL_PROVIDER_MODEL_INPUT, String(index))}
                    deleteTestId={testId(TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON, String(index))}
                    model={model}
                    onCommit={(value, basedOnRevision) =>
                      onModelCommit(model.modelId, value, basedOnRevision)
                    }
                    onResolveDraft={(nextModelId, personalConfig) => {
                      if (onResolveDraftModel)
                        return onResolveDraftModel(model.modelId, nextModelId, personalConfig);
                      return providerSettingsService.resolveModelConfig({
                        providerId,
                        originalModelId: model.modelId,
                        modelId: nextModelId,
                        personalConfig: structuredClone(personalConfig),
                      });
                    }}
                    settingsRevision={settingsRevision}
                    onDelete={!model.builtin ? () => onDeleteModel(model.modelId) : undefined}
                    onEnabledChange={(enabled) => {
                      void Promise.resolve(onModelEnabledChange?.(model.modelId, enabled)).catch(
                        () => undefined,
                      );
                    }}
                    onTest={onTestModel}
                  />
                  {!completeProperties && (
                    <div className="px-3 pb-2 text-ui-sm text-destructive">
                      {model.issues?.[0]?.message ??
                        intl.formatMessage({ id: "settings.modelProvider.modelConfigIncomplete" })}
                    </div>
                  )}
                </>
              );
            }}
          />
        </div>
      ) : (
        <div className="mt-1 flex h-12 items-center justify-start gap-2 rounded-lg border border-dashed border-border px-4 text-left text-ui-base text-foreground-subtle">
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          {intl.formatMessage({ id: "settings.modelProvider.modelsEmpty" })}
        </div>
      )}
      {addDialogOpen ? (
        <ModelCatalogAddDialog
          catalog={activeCatalog?.ids ?? []}
          existing={new Set(models.map((model) => model.modelId))}
          onClose={() => setAddDialogOpen(false)}
          onAdd={async (modelId) => {
            const model = { ...createEmptyModel(), modelId, useRecommendedConfig: true };
            await onAddModel(model);
          }}
        />
      ) : null}
    </section>
  );
}

function ModelCatalogAddDialog({
  catalog,
  existing,
  onAdd,
  onClose,
}: {
  catalog: readonly string[];
  existing: ReadonlySet<string>;
  onAdd(modelId: string): Promise<void>;
  onClose(): void;
}) {
  const { intl } = useZCodeIntl();
  const [filter, setFilter] = useState("");
  const [manual, setManual] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const saving = useRef(false);
  const saved = useRef(new Set<string>());
  const ids = [...new Set([...selected, manual.trim()].filter((id) => id && !existing.has(id)))];
  const matching = catalog.filter((id) => id.toLowerCase().includes(filter.trim().toLowerCase()));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !ids.length) return;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    try {
      for (const id of ids) {
        if (saved.current.has(id)) continue;
        await onAdd(id);
        saved.current.add(id);
      }
      onClose();
    } catch {
      setError(intl.formatMessage({ id: "settings.modelProvider.catalog.addFailed" }));
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }

  const close = () => {
    if (!saving.current) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg" data-testid="model-catalog-add-dialog">
        <div className="flex items-center gap-2 pr-8">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={intl.formatMessage({ id: "common.back" })}
            onClick={close}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
          <DialogTitle>{intl.formatMessage({ id: "settings.modelProvider.addModel" })}</DialogTitle>
        </div>
        <DialogDescription>
          {intl.formatMessage({ id: "settings.modelProvider.catalog.addHint" })}
        </DialogDescription>
        <form className="min-w-0 space-y-3" onSubmit={(event) => void save(event)}>
          {catalog.length > 0 ? (
            <>
              <Input
                size="lg"
                disabled={busy}
                aria-label={intl.formatMessage({ id: "settings.modelProvider.catalog.search" })}
                placeholder={intl.formatMessage({ id: "settings.modelProvider.catalog.search" })}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <div className="max-h-[30dvh] overflow-y-auto rounded-lg border border-border">
                {matching.map((id) => (
                  <label
                    key={id}
                    className="flex min-h-8 min-w-0 items-center gap-2 px-3 py-1 text-ui-base hover:bg-surface-hover"
                  >
                    <Checkbox
                      checked={selected.includes(id) || existing.has(id)}
                      disabled={busy || existing.has(id)}
                      onCheckedChange={(checked) => {
                        setSelected((current) =>
                          checked ? [...current, id] : current.filter((item) => item !== id),
                        );
                      }}
                    />
                    <span className="min-w-0 break-all">{id}</span>
                  </label>
                ))}
                {!matching.length ? (
                  <p className="px-3 py-2 text-ui-sm text-foreground-subtle">
                    {intl.formatMessage({ id: "settings.modelProvider.catalog.empty" })}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          <Input
            {...TECHNICAL_INPUT_ATTRIBUTES}
            size="lg"
            disabled={busy}
            aria-label={intl.formatMessage({ id: "settings.modelProvider.catalog.manual" })}
            placeholder={intl.formatMessage({ id: "settings.modelProvider.catalog.manual" })}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button type="submit" disabled={busy || ids.length === 0}>
              {intl.formatMessage({ id: "common.save" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
