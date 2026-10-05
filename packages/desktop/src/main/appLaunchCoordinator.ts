interface AppLaunchGateLike {
  consume(): boolean;
}
export function createAppLaunchCoordinator(appLaunchGate: AppLaunchGateLike) {
  return {
    onRendererReady(_input: { rendererId: number }): boolean {
      return appLaunchGate.consume();
    },
  };
}
