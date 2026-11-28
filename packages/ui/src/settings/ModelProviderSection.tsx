import type { ModelConfigObject, ProviderSettingsCreateInput } from "@zcode/provider";
import {
  TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON,
  TID_MODEL_PROVIDER_NAV_ITEM,
  TID_MODEL_PROVIDER_TEMPLATE_BACK_BUTTON,
  testId,
} from "@zcode/shared/test-ids";
import {
  ArrowLeft,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Input } from "@/components/ui/input.js";
import { Switch } from "@/components/ui/switch.js";
import { useModelProviders } from "@/hooks/useModelProviders.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  getProviderFormLabel,
  type ProviderSettingsFormModel,
  type ProviderSettingsFormProvider,
} from "@/lib/providerSettingsFormTypes.js";
import type { SettingsModelProviderTarget } from "@/lib/settingsNavigation.js";
import { InlineEditableProviderCard } from "@/settings/model-provider-section/InlineEditableProviderCard.js";
import { resolveProviderConnectionApiFormatDisplayLabel } from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { serializePersonalProviderDraft } from "@/settings/model-provider-section/ProviderDraftSave.js";
import { useProviderDetailFeedback } from "@/settings/model-provider-section/ProviderDetailFeedback.js";
import { ProviderLogo } from "@/settings/model-provider-section/ProviderLogo.js";
import { ProviderTemplatePicker } from "@/settings/model-provider-section/ProviderTemplatePicker.js";

type ProviderDialog =
  | { kind: "picker" | "create" }
  | { kind: "edit" | "delete"; providerId: string };

const wideColumns =
  "@min-[37rem]/model-gateway:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.6fr)_4rem_6.5rem]";
const wideCell = "hidden min-w-0 @min-[37rem]/model-gateway:block";

export function ModelProviderSection({
  pendingModelProviderTarget,
  onConsumePendingModelProviderTarget,
  ...target
}: Parameters<typeof useModelProviders>[0] & {
  pendingModelProviderTarget?: SettingsModelProviderTarget;
  onConsumePendingModelProviderTarget(): void;
}) {
  const { intl } = useZCodeIntl();
  const { showFeedback } = useProviderDetailFeedback();
  const connection = useModelProviders(target);
  const { previewPersonalProvider, saveProvider } = connection;
  const providers = connection.modelProviders.filter(
    (provider) => provider.config.access?.type !== "zhipu-account",
  );
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<ProviderDialog | null>(null);
  const [draftProvider, setDraftProvider] = useState<ProviderSettingsFormProvider | null>(null);
  const [savingDialog, setSavingDialog] = useState(false);
  const [dialogError, setDialogError] = useState(false);
  const [switchesPending, setSwitchesPending] = useState<readonly string[]>([]);
  const draftRef = useRef<ProviderSettingsFormProvider | null>(null);
  const draftSelectionRef = useRef<object | null>(null);
  const flushDraftRef = useRef<(() => Promise<void>) | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pickerScrollRef = useRef(0);
  const newProviderButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  const publishDraft = useCallback((provider: ProviderSettingsFormProvider | null) => {
    draftRef.current = provider;
    setDraftProvider(provider);
  }, []);
  const changeDialog = useCallback(
    (next: ProviderDialog | null) => {
      draftSelectionRef.current = null;
      publishDraft(null);
      setDialogError(false);
      setDialog(next);
    },
    [publishDraft],
  );

  const pendingId = pendingModelProviderTarget?.providerId;
  const hasPending = providers.some((provider) => provider.providerId === pendingId);
  useEffect(() => {
    if (!pendingId || !hasPending) return;
    changeDialog({ kind: "edit", providerId: pendingId });
    onConsumePendingModelProviderTarget();
  }, [changeDialog, hasPending, onConsumePendingModelProviderTarget, pendingId]);

  const dialogKind = dialog?.kind;
  const selected =
    dialog && "providerId" in dialog
      ? providers.find((provider) => provider.providerId === dialog.providerId)
      : draftProvider;

  useLayoutEffect(() => {
    if (bodyRef.current)
      bodyRef.current.scrollTop = dialogKind === "picker" ? pickerScrollRef.current : 0;
  }, [dialogKind]);

  function openPicker() {
    returnFocusRef.current = newProviderButtonRef.current;
    pickerScrollRef.current = 0;
    changeDialog({ kind: "picker" });
  }

  function goBack() {
    changeDialog(dialogKind === "create" ? { kind: "picker" } : null);
  }

  async function selectTemplate(input: ProviderSettingsCreateInput) {
    const selection = {};
    draftSelectionRef.current = selection;
    pickerScrollRef.current = bodyRef.current?.scrollTop ?? 0;
    setDialogError(false);
    setDialog({ kind: "create" });
    try {
      const draft = await previewPersonalProvider(input);
      if (draftSelectionRef.current === selection) publishDraft(draft);
    } catch {
      if (draftSelectionRef.current === selection) setDialogError(true);
    }
  }

  function getDraft() {
    const draft = draftRef.current;
    if (!draft) throw new Error("The provider draft is closed.");
    return draft;
  }

  const saveDraftConnection = useCallback(
    async (next: ProviderSettingsFormProvider) => {
      const current = draftRef.current;
      if (!current) return;
      const draft = {
        ...current,
        providerName: next.providerName,
        config: next.config,
        personalConfig: next.personalConfig,
      };
      publishDraft(draft);
      if (
        current.config.api?.type !== next.config.api?.type ||
        current.config.api?.baseUrl !== next.config.api?.baseUrl
      ) {
        const resolved = await previewPersonalProvider(serializePersonalProviderDraft(draft));
        if (draftRef.current === draft) publishDraft(resolved);
      }
    },
    [previewPersonalProvider, publishDraft],
  );
  const saveExistingProvider = useCallback(
    async (provider: ProviderSettingsFormProvider) => {
      await saveProvider(provider);
    },
    [saveProvider],
  );

  function updateDraftModels(
    update: (models: ProviderSettingsFormModel[]) => ProviderSettingsFormModel[],
  ) {
    const draft = getDraft();
    publishDraft({ ...draft, models: update(draft.models) });
  }

  async function addDraftModel(modelId: string) {
    const draft = getDraft();
    const input = serializePersonalProviderDraft(draft);
    const selection = draftSelectionRef.current;
    const preview = await previewPersonalProvider({
      ...input,
      initialConfig: {
        ...input.initialConfig,
        personalModelIds: [...(input.initialConfig?.personalModelIds ?? []), modelId],
      },
      initialModels: [
        ...(input.initialModels ?? []),
        { modelId, config: { enabled: true }, useRecommendedConfig: true },
      ],
    });
    if (draftSelectionRef.current !== selection) return;
    const model = preview.models.find((item) => item.modelId === modelId);
    if (!model) throw new Error("The model was not found in the provider draft.");
    updateDraftModels((models) => [...models, model]);
  }

  function replaceDraftModel(originalId: string, model: ProviderSettingsFormModel) {
    if (
      model.modelId !== originalId &&
      getDraft().models.some((item) => item.modelId === model.modelId)
    )
      throw new Error(intl.formatMessage({ id: "settings.modelProvider.operationFailed" }));
    updateDraftModels((models) =>
      models.map((item) => (item.modelId === originalId ? model : item)),
    );
  }

  async function resolveDraftModel(
    originalId: string,
    modelId: string,
    personalConfig: ModelConfigObject,
  ) {
    const draft = getDraft();
    const preview = await previewPersonalProvider(
      serializePersonalProviderDraft({
        ...draft,
        models: draft.models.map((item) =>
          item.modelId === originalId
            ? {
                ...item,
                modelId,
                personalConfig,
                useRecommendedConfig: true,
                hasPersonalConfig: true,
              }
            : item,
        ),
      }),
    );
    const model = preview.models.find((item) => item.modelId === modelId);
    if (!model) throw new Error("The model was not found in the provider draft.");
    return {
      inheritedConfig: model.inheritedConfig ?? {},
      effectiveConfig: model.config,
      issues: model.issues ?? [],
    };
  }

  async function finishDialog() {
    if (!dialog || dialog.kind === "picker" || savingDialog) return;
    setSavingDialog(true);
    setDialogError(false);
    try {
      if (dialog.kind === "delete") {
        await connection.deleteProvider(dialog.providerId);
      } else {
        await flushDraftRef.current?.();
        if (dialog.kind === "create") {
          await connection.createPersonalProvider(serializePersonalProviderDraft(getDraft()));
          setQuery("");
        }
      }
      changeDialog(null);
    } catch {
      setDialogError(true);
    } finally {
      setSavingDialog(false);
    }
  }

  async function setProviderEnabled(provider: ProviderSettingsFormProvider, enabled: boolean) {
    const id = provider.providerId;
    setSwitchesPending((previous) => [...previous, id]);
    try {
      await connection.saveProvider({ ...provider, enabledUpdate: enabled });
    } catch {
      showFeedback({
        key: `provider-enabled:${id}`,
        state: "failure",
        message: intl.formatMessage({ id: "settings.modelProvider.operationFailed" }),
        dismissible: true,
      });
    } finally {
      setSwitchesPending((previous) => previous.filter((providerId) => providerId !== id));
    }
  }

  const filter = query.trim().toLowerCase();
  const visible = providers.filter((provider) =>
    [getProviderFormLabel(provider), provider.config.api?.baseUrl].some((value) =>
      value?.toLowerCase().includes(filter),
    ),
  );
  const searchLabel = intl.formatMessage({ id: "settings.modelProvider.list.search" });
  const providerName = selected ? getProviderFormLabel(selected) : "";
  const dialogTitle =
    dialogKind === "delete"
      ? intl.formatMessage(
          { id: "settings.modelProvider.deleteConfirmTitle" },
          { name: providerName },
        )
      : intl.formatMessage({
          id:
            dialogKind === "picker"
              ? "settings.modelProvider.templatePickerTitle"
              : "settings.modelProvider.configureProvider",
        });

  return (
    <div
      className="@container/model-gateway min-w-0 space-y-4"
      data-testid="model-gateway-providers"
    >
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="relative mr-auto min-w-32 max-w-64 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="pl-9"
            placeholder={searchLabel}
            aria-label={searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={connection.refreshing}
          onClick={() => void connection.refresh()}
        >
          <RefreshCw className={cn(connection.refreshing && "animate-spin")} aria-hidden="true" />
          {intl.formatMessage({ id: "settings.modelProvider.refresh" })}
        </Button>
        <Button
          ref={newProviderButtonRef}
          type="button"
          data-testid={TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON}
          disabled={connection.loading || Boolean(connection.loadError)}
          onClick={openPicker}
        >
          <Plus aria-hidden="true" />
          {intl.formatMessage({ id: "settings.modelProvider.newProviderName" })}
        </Button>
      </div>
      {connection.loadError ? (
        <Button variant="outline" onClick={connection.reload}>
          {intl.formatMessage({ id: "common.retry" })}
        </Button>
      ) : connection.loading ? (
        <p role="status" className="text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "common.loading" })}
        </p>
      ) : (
        <ProviderDirectory
          providers={visible}
          filtering={Boolean(filter)}
          switchesPending={switchesPending}
          onEdit={(provider, button) => {
            returnFocusRef.current = button;
            changeDialog({ kind: "edit", providerId: provider.providerId });
          }}
          onDelete={(provider) => changeDialog({ kind: "delete", providerId: provider.providerId })}
          onToggle={(provider, enabled) => void setProviderEnabled(provider, enabled)}
        />
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !savingDialog) changeDialog(null);
        }}
      >
        {dialog ? (
          <DialogContent
            data-testid="model-provider-dialog"
            className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl"
            onEscapeKeyDown={(event) => {
              if (savingDialog || dialogKind === "create") {
                event.preventDefault();
                if (!savingDialog) goBack();
              }
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const opener = returnFocusRef.current;
              (opener?.isConnected ? opener : newProviderButtonRef.current)?.focus();
            }}
          >
            <DialogHeader className="pr-8">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={savingDialog}
                  data-testid={TID_MODEL_PROVIDER_TEMPLATE_BACK_BUTTON}
                  aria-label={intl.formatMessage({ id: "common.back" })}
                  onClick={goBack}
                >
                  <ArrowLeft aria-hidden="true" />
                </Button>
                <DialogTitle>{dialogTitle}</DialogTitle>
              </div>
              {dialogKind !== "delete" ? (
                <DialogDescription className="sr-only">{dialogTitle}</DialogDescription>
              ) : null}
            </DialogHeader>
            <div
              ref={bodyRef}
              inert={savingDialog}
              className="min-h-0 space-y-3 overflow-y-auto px-1"
            >
              {dialogKind === "picker" ? (
                <ProviderTemplatePicker
                  templates={connection.providerTemplates}
                  onSelect={(input) => void selectTemplate(input)}
                />
              ) : dialogKind === "delete" ? (
                <DialogDescription>
                  {intl.formatMessage({ id: "settings.modelProvider.deleteConfirmDescription" })}
                </DialogDescription>
              ) : selected ? (
                <InlineEditableProviderCard
                  key={selected.providerId}
                  provider={selected}
                  providerToggleVisible={false}
                  flushDraftRef={flushDraftRef}
                  settingsRevision={connection.providerSettingsView?.revision}
                  {...(dialogKind === "create"
                    ? {
                        onSave: saveDraftConnection,
                        onAddPersonalModel: (_providerId: string, modelId: string) =>
                          addDraftModel(modelId),
                        onCommitDraftModel: replaceDraftModel,
                        onResolveDraftModel: resolveDraftModel,
                        onListDraftModels: () => {
                          const draft = getDraft();
                          return connection.listDraftModels(
                            draft.providerId,
                            serializePersonalProviderDraft(draft),
                          );
                        },
                        onSetPersonalModelEnabled: async (
                          _providerId: string,
                          modelId: string,
                          enabled: boolean,
                        ) => {
                          const model = getDraft().models.find((item) => item.modelId === modelId);
                          if (model)
                            replaceDraftModel(modelId, {
                              ...model,
                              config: { ...model.config, enabled },
                              personalConfig: { ...model.personalConfig, enabled },
                              hasPersonalConfig: true,
                            });
                        },
                        onDeletePersonalModel: async (_providerId: string, modelId: string) => {
                          updateDraftModels((models) =>
                            models.filter((model) => model.modelId !== modelId),
                          );
                        },
                      }
                    : {
                        onSave: saveExistingProvider,
                        onAddPersonalModel: connection.addPersonalModel,
                        onSavePersonalModelDraft: connection.savePersonalModelDraft,
                        onSetPersonalModelEnabled: connection.setPersonalModelEnabled,
                        onDeletePersonalModel: connection.deletePersonalModel,
                        onReorderModelIds: (ids: string[]) =>
                          connection
                            .reorderProviderModels(selected.providerId, ids)
                            .then(() => undefined),
                        onTestModel: connection.testModelConnectivity,
                      })}
                />
              ) : dialogKind === "create" && !dialogError ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-ui-base text-foreground-subtle"
                >
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  {intl.formatMessage({ id: "common.loading" })}
                </p>
              ) : null}
              {dialogError ? (
                <p role="alert" className="text-ui-sm text-destructive">
                  {intl.formatMessage({ id: "settings.modelProvider.operationFailed" })}
                </p>
              ) : null}
            </div>
            {dialogKind !== "picker" ? (
              <DialogFooter>
                {dialogKind === "delete" ? (
                  <Button variant="outline" disabled={savingDialog} onClick={goBack}>
                    {intl.formatMessage({ id: "common.cancel" })}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  data-testid="model-provider-dialog-done"
                  variant={dialogKind === "delete" ? "destructive" : "default"}
                  disabled={savingDialog || !selected}
                  onClick={() => void finishDialog()}
                >
                  {savingDialog ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : null}
                  {intl.formatMessage({
                    id:
                      dialogKind === "delete"
                        ? "settings.modelProvider.deleteConfirmAction"
                        : "settings.modelProvider.finish",
                  })}
                </Button>
              </DialogFooter>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function ProviderDirectory({
  providers,
  filtering,
  switchesPending,
  onEdit,
  onDelete,
  onToggle,
}: {
  providers: ProviderSettingsFormProvider[];
  filtering: boolean;
  switchesPending: readonly string[];
  onEdit(provider: ProviderSettingsFormProvider, button: HTMLButtonElement): void;
  onDelete(provider: ProviderSettingsFormProvider): void;
  onToggle(provider: ProviderSettingsFormProvider, enabled: boolean): void;
}) {
  const { intl } = useZCodeIntl();
  if (!providers.length) {
    return (
      <p className="py-8 text-center text-ui-base text-foreground-subtle">
        {intl.formatMessage({
          id: filtering ? "settings.modelProvider.list.noMatches" : "settings.modelProvider.empty",
        })}
      </p>
    );
  }

  return (
    <div
      role="table"
      aria-label={intl.formatMessage({ id: "settings.modelProvider.directoryTitle" })}
      data-testid="model-provider-list"
      className="overflow-hidden rounded-xl border border-border"
    >
      <div
        role="row"
        className={cn(
          "hidden items-center gap-3 border-b border-border bg-surface px-3 py-2 text-ui-sm text-foreground-subtle @min-[37rem]/model-gateway:grid",
          wideColumns,
        )}
      >
        <div role="columnheader">
          {intl.formatMessage({ id: "settings.modelProvider.directoryTitle" })}
        </div>
        <div role="columnheader">
          {intl.formatMessage({ id: "settings.modelProvider.apiFormat" })}
        </div>
        <div role="columnheader">{intl.formatMessage({ id: "settings.modelProvider.models" })}</div>
        <div role="columnheader" className="text-center">
          {intl.formatMessage({ id: "settings.modelProvider.enableModel" })}
        </div>
        <div role="columnheader" className="text-center">
          {intl.formatMessage({ id: "settings.modelProvider.list.actions" })}
        </div>
      </div>
      {providers.map((provider) => {
        const name = getProviderFormLabel(provider);
        const api = provider.config.api;
        const format = api?.type
          ? resolveProviderConnectionApiFormatDisplayLabel(intl, api.type)
          : "—";
        const modelCount = intl.formatMessage(
          { id: "settings.modelProvider.list.modelCount" },
          { count: provider.models.length },
        );
        const activeCount = provider.models.filter(({ config }) => config.enabled !== false).length;
        return (
          <div
            role="row"
            data-testid="model-provider-row"
            key={provider.providerId}
            className={cn(
              "grid min-h-16 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-hover",
              wideColumns,
            )}
          >
            <div role="cell" className="flex min-w-0 items-center gap-2">
              <ProviderLogo
                logo={provider.config.logo}
                className="size-7 shrink-0 text-foreground-subtle"
              />
              <div className="min-w-0">
                <p className="break-words text-ui-base font-medium">{name}</p>
                <p
                  className="truncate text-ui-sm text-foreground-subtle"
                  title={api?.baseUrl ?? undefined}
                >
                  {api?.baseUrl || "—"}
                </p>
                <p className="break-words text-ui-sm text-foreground-subtle @min-[37rem]/model-gateway:hidden">
                  {format} · {modelCount}
                </p>
              </div>
            </div>
            <div role="cell" className={cn(wideCell, "break-words text-ui-base")}>
              {format}
            </div>
            <div role="cell" className={wideCell}>
              <p className="text-ui-base">{modelCount}</p>
              <p className="text-ui-sm text-foreground-subtle">
                {intl.formatMessage(
                  { id: "settings.modelProvider.list.enabledCount" },
                  { count: activeCount },
                )}
              </p>
            </div>
            <div role="cell" className="flex justify-center">
              <Switch
                className="after:-inset-x-1"
                aria-label={
                  intl.formatMessage({
                    id: provider.enabled
                      ? "settings.modelProvider.disableProvider"
                      : "settings.modelProvider.enableProvider",
                  }) +
                  " " +
                  name
                }
                checked={provider.enabled}
                disabled={switchesPending.includes(provider.providerId)}
                onCheckedChange={(enabled) => onToggle(provider, enabled)}
              />
            </div>
            <div role="cell" className="flex shrink-0 items-center justify-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid={testId(TID_MODEL_PROVIDER_NAV_ITEM, `custom:${provider.providerId}`)}
                onClick={(event) => onEdit(provider, event.currentTarget)}
              >
                <Pencil aria-hidden="true" />
                {intl.formatMessage({ id: "settings.modelProvider.edit" })}
              </Button>
              {provider.hasPersonalConfig ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={intl.formatMessage({ id: "common.more" })}
                      data-testid="model-provider-row-actions"
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(provider)}>
                      <Trash2 aria-hidden="true" />
                      {intl.formatMessage({ id: "common.delete" })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
