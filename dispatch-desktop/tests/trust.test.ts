import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { DispatchService } from "../src/core/dispatchService";
import { AssignmentEngine } from "../src/core/assignmentEngine";

// Signatures here are "valid" when the key handed to verify is the one the
// fake sender signed with, which is all the trust logic looks at.
function harness(known: Record<string, number[]>) {
  const remembered: Array<{ deviceId: string; key: number[] }> = [];
  const keys = new Map(Object.entries(known).map(([id, key]) => [id, Uint8Array.from(key)]));
  const keyStore = {
    identity: { deviceId: "dispatch", publicKey: Uint8Array.from([9]) },
    getPublicKey: (id: string) => keys.get(id) ?? null,
    rememberTrustedDevice: (deviceId: string, _role: string, key: Uint8Array) => {
      remembered.push({ deviceId, key: [...key] });
      keys.set(deviceId, key);
    }
  };
  const crypto = {
    init: async () => {},
    verifyEnvelope: async (envelope: { signedWith: number[] }, key: Uint8Array) =>
      envelope.signedWith.length === key.length && envelope.signedWith.every((b, i) => b === key[i]),
    decrypt: async () => null
  };
  const db = {
    hasProcessedMessage: () => false,
    logMessage: () => {},
    markProcessedMessage: () => {}
  };
  const service = new DispatchService(
    db as never,
    new EventEmitter() as never,
    crypto as never,
    keyStore as never,
    new AssignmentEngine(),
    { mapStyleUrl: null }
  );
  const receive = (senderDeviceId: string, signedWith: number[]) =>
    (service as unknown as { handleIncomingEnvelope: (e: unknown, v: string, h: string) => Promise<void> })
      .handleIncomingEnvelope(
        {
          messageId: `m-${Math.random()}`,
          senderDeviceId,
          senderRole: "DRIVER",
          keyId: Uint8Array.from(signedWith),
          signedWith,
          createdAtMs: Date.now(),
          ttlMs: 60_000,
          ciphertext: new Uint8Array(),
          signature: new Uint8Array(),
          nonce: new Uint8Array(),
          type: "DRIVER_HEARTBEAT"
        },
        "LAN",
        "test"
      );
  return { remembered, keys, receive };
}

describe("sender trust", () => {
  it("trusts a new device on first use", async () => {
    const h = harness({});
    await h.receive("driver-new", [1, 2, 3]);
    expect(h.remembered).toEqual([{ deviceId: "driver-new", key: [1, 2, 3] }]);
  });

  it("never replaces the key of a device it already knows", async () => {
    const h = harness({ "driver-a": [1, 2, 3] });
    await h.receive("driver-a", [7, 7, 7]);
    expect(h.remembered).toEqual([]);
    expect([...h.keys.get("driver-a")!]).toEqual([1, 2, 3]);
  });
});
