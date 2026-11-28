import { useState, type ReactNode } from "react";
import { DesktopWindowControls } from "@/DesktopWindowControls.js";
import {
  SettingsBreadcrumbProvider,
  SettingsHeaderBreadcrumb,
  type SettingsBreadcrumbItem,
} from "@/settings/SettingsHeaderBreadcrumb.js";

/**
 * 这些工作区页面有自己的面包屑，切入时项目标题栏会隐藏，由当前顶栏承接共用窗控。
 */
export function AutomationsMainBreadcrumbFrame({
  ariaLabel,
  children,
  isDesktop,
  sectionLabel,
  showWindowControls,
}: {
  ariaLabel: string;
  children: ReactNode;
  isDesktop: boolean;
  sectionLabel: string;
  showWindowControls: boolean;
}) {
  const [items, setItems] = useState<readonly SettingsBreadcrumbItem[]>([]);

  return (
    <SettingsBreadcrumbProvider onItemsChange={setItems} sectionLabel={sectionLabel}>
      <div className="flex min-h-0 flex-1 flex-col">
        {isDesktop ? (
          <div
            className="flex h-12 shrink-0 items-center [app-region:drag]"
            data-testid="automations-main-drag-region"
          >
            <SettingsHeaderBreadcrumb ariaLabel={ariaLabel} items={items} />
            {showWindowControls ? (
              <div className="ml-auto shrink-0 pr-2">
                <DesktopWindowControls />
              </div>
            ) : null}
          </div>
        ) : null}
        {children}
      </div>
    </SettingsBreadcrumbProvider>
  );
}
