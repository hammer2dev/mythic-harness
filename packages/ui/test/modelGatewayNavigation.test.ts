import assert from "node:assert/strict";
import test from "node:test";
import {
  addModelGatewayOpenListener,
  consumeModelGatewayOpenTarget,
  requestModelGatewayOpen,
  type ModelGatewayOpenTarget,
} from "../src/lib/modelGatewayNavigation.js";

test("已挂载的导航所有者收到显式目标并一次性消费，不留下旧意图", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  let received: ModelGatewayOpenTarget | null = null;
  const removeListener = addModelGatewayOpenListener((target) => {
    assert.deepEqual(consumeModelGatewayOpenTarget(), target);
    received = target;
  });
  try {
    requestModelGatewayOpen({ section: "modelProvider", providerId: "custom-provider" });
    assert.deepEqual(received, { section: "modelProvider", providerId: "custom-provider" });
    assert.equal(consumeModelGatewayOpenTarget(), null);
  } finally {
    removeListener();
    consumeModelGatewayOpenTarget();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("导航所有者尚未挂载时保留目标，默认入口和统计目标均可延后消费", () => {
  requestModelGatewayOpen();
  assert.deepEqual(consumeModelGatewayOpenTarget(), { section: "modelProvider" });
  requestModelGatewayOpen({ section: "usage" });
  assert.deepEqual(consumeModelGatewayOpenTarget(), { section: "usage" });
  assert.equal(consumeModelGatewayOpenTarget(), null);
});
