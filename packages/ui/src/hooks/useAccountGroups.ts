import { useEffect, useState } from "react";
import type { AccountGroup, IAccountGroupsService } from "@/account-management/contract.js";
import { useServices } from "./useServices.js";

type AccountGroupsState =
  | { status: "loading" | "error" }
  | { status: "ready"; groups: AccountGroup[] };

export function useAccountGroups() {
  const { accountGroupsService } = useServices();
  const [state, setState] = useState<AccountGroupsState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (accountGroupsService) {
      void accountGroupsService.listGroups().then(
        (groups) => {
          if (active) setState({ status: "ready", groups });
        },
        () => {
          if (active) setState({ status: "error" });
        },
      );
    }
    return () => {
      active = false;
    };
  }, [accountGroupsService, loadAttempt]);

  function requireService(): IAccountGroupsService {
    if (!accountGroupsService) throw new Error("account-groups.unavailable");
    return accountGroupsService;
  }

  return {
    state: accountGroupsService ? state : ({ status: "error" } as const),
    retry() {
      setState({ status: "loading" });
      setLoadAttempt((attempt) => attempt + 1);
    },
    async saveGroup(input: Parameters<IAccountGroupsService["saveGroup"]>[0]) {
      const { id, groups } = await requireService().saveGroup(input);
      setState({ status: "ready", groups });
      return id;
    },
    async deleteGroup(id: string) {
      const groups = await requireService().deleteGroup(id);
      setState({ status: "ready", groups });
    },
    async saveEntry(input: Parameters<IAccountGroupsService["saveEntry"]>[0]) {
      const groups = await requireService().saveEntry(input);
      setState({ status: "ready", groups });
    },
    async deleteEntry(target: Parameters<IAccountGroupsService["deleteEntry"]>[0]) {
      const groups = await requireService().deleteEntry(target);
      setState({ status: "ready", groups });
    },
  };
}
