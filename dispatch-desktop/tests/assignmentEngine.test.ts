import { describe, expect, it, vi } from "vitest";
import { AssignmentEngine } from "../src/core/assignmentEngine";
import { DriverState, Incident } from "../src/core/types";

function driver(overrides: Partial<DriverState>): DriverState {
  return {
    deviceId: "d1",
    name: "d1",
    status: "AVAILABLE",
    lastLat: 0,
    lastLng: 0,
    lastFixAtMs: Date.now(),
    batteryPct: 100,
    activeAssignments: 0,
    lastAssignedAtMs: 0,
    ...overrides
  };
}

describe("AssignmentEngine", () => {
  const engine = new AssignmentEngine();

  it("chooses nearest available driver", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T00:00:00Z"));

    const incident: Incident = {
      id: "i1",
      createdAtMs: Date.now(),
      lat: 40.0,
      lng: -74.0,
      accuracyM: 10,
      status: "RECEIVED",
      priority: 1,
      sourceDeviceId: "s1",
      assignedDriverId: null,
      assignedAtMs: null,
      resolvedAtMs: null
    };

    const selected = engine.chooseDriver(incident, [
      driver({ deviceId: "far", lastLat: 41.2, lastLng: -75.3 }),
      driver({ deviceId: "near", lastLat: 40.001, lastLng: -74.001 })
    ]);

    expect(selected?.driver.deviceId).toBe("near");
    vi.useRealTimers();
  });

  it("returns null when no eligible responders", () => {
    const incident: Incident = {
      id: "i2",
      createdAtMs: Date.now(),
      lat: 40,
      lng: -74,
      accuracyM: 10,
      status: "RECEIVED",
      priority: 1,
      sourceDeviceId: "s1",
      assignedDriverId: null,
      assignedAtMs: null,
      resolvedAtMs: null
    };

    const selected = engine.chooseDriver(incident, [
      driver({ status: "UNAVAILABLE" }),
      driver({ batteryPct: 5 })
    ]);

    expect(selected).toBeNull();
  });

  it("skips drivers excluded for this incident", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T00:00:00Z"));
    const incident: Incident = {
      id: "i1",
      createdAtMs: Date.now(),
      lat: 40.0,
      lng: -74.0,
      accuracyM: 10,
      status: "RECEIVED",
      priority: 1,
      sourceDeviceId: "s1",
      assignedDriverId: null,
      assignedAtMs: null,
      resolvedAtMs: null
    };
    const near = driver({ deviceId: "near", lastLat: 40.0001, lastLng: -74.0 });
    const far = driver({ deviceId: "far", lastLat: 40.05, lastLng: -74.0 });
    expect(engine.chooseDriver(incident, [near, far])?.driver.deviceId).toBe("near");
    expect(engine.chooseDriver(incident, [near, far], { exclude: ["near"] })?.driver.deviceId).toBe("far");
    expect(engine.chooseDriver(incident, [near], { exclude: ["near"] })).toBeNull();
    vi.useRealTimers();
  });
});
