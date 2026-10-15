import { afterEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DispatchDatabase } from "../src/db/database";

const files: string[] = [];

function freshDb(): DispatchDatabase {
  const file = path.join(os.tmpdir(), `emergance-life-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  files.push(file);
  const db = new DispatchDatabase(file);
  db.upsertIncidentFromSos({
    incidentId: "inc",
    lat: 14.6,
    lng: 121.0,
    accuracyM: 10,
    createdAtMs: Date.now(),
    sourceDeviceId: "phone",
    status: "RECEIVED"
  });
  return db;
}

afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

describe("assignment lifecycle", () => {
  it("a timeout after cancel leaves the incident cancelled", () => {
    const db = freshDb();
    db.createAssignment("inc", "driver-a", Date.now() - 1);
    db.updateIncidentStatus({ incidentId: "inc", status: "CANCELLED" });
    db.expireTimedOutAssignments(Date.now());
    expect(db.getIncident("inc")?.status).toBe("CANCELLED");
    db.close();
  });

  it("a late reject after resolve leaves the incident resolved", () => {
    const db = freshDb();
    const offer = db.createAssignment("inc", "driver-a", Date.now() + 15_000);
    db.updateIncidentStatus({ incidentId: "inc", status: "RESOLVED" });
    db.markAssignmentRejected(offer, "BUSY");
    expect(db.getIncident("inc")?.status).toBe("RESOLVED");
    db.close();
  });

  it("a reject for an offer that already timed out does not reopen a reassigned incident", () => {
    const db = freshDb();
    const first = db.createAssignment("inc", "driver-a", Date.now() - 1);
    db.expireTimedOutAssignments(Date.now());
    const second = db.createAssignment("inc", "driver-b", Date.now() + 15_000);
    expect(db.markAssignmentAck(second, Date.now())).toBe(true);
    db.markAssignmentRejected(first, "BUSY");
    const incident = db.getIncident("inc");
    expect(incident?.status).toBe("ASSIGNED");
    expect(incident?.assignedDriverId).toBe("driver-b");
    db.close();
  });

  it("a late ack after someone else accepted is refused", () => {
    const db = freshDb();
    const first = db.createAssignment("inc", "driver-a", Date.now() - 1);
    db.expireTimedOutAssignments(Date.now());
    const second = db.createAssignment("inc", "driver-b", Date.now() + 15_000);
    expect(db.markAssignmentAck(second, Date.now())).toBe(true);
    expect(db.markAssignmentAck(first, Date.now())).toBe(false);
    expect(db.getIncident("inc")?.assignedDriverId).toBe("driver-b");
    db.close();
  });

  it("a late ack still counts while the incident is waiting for anyone", () => {
    const db = freshDb();
    const first = db.createAssignment("inc", "driver-a", Date.now() - 1);
    db.expireTimedOutAssignments(Date.now());
    expect(db.markAssignmentAck(first, Date.now())).toBe(true);
    expect(db.getIncident("inc")?.status).toBe("ASSIGNED");
    db.close();
  });

  it("an ack on a cancelled incident is refused", () => {
    const db = freshDb();
    const offer = db.createAssignment("inc", "driver-a", Date.now() + 15_000);
    db.updateIncidentStatus({ incidentId: "inc", status: "CANCELLED" });
    expect(db.markAssignmentAck(offer, Date.now())).toBe(false);
    expect(db.getIncident("inc")?.status).toBe("CANCELLED");
    db.close();
  });

  it("remembers who declined an incident", () => {
    const db = freshDb();
    const since = Date.now() - 1_000;
    const rejected = db.createAssignment("inc", "driver-a", Date.now() + 15_000);
    db.markAssignmentRejected(rejected, "BUSY");
    db.createAssignment("inc", "driver-b", Date.now() - 1);
    db.expireTimedOutAssignments(Date.now());
    db.createAssignment("inc", "driver-c", Date.now() + 15_000);
    expect(db.declinedDriverIds("inc", since).sort()).toEqual(["driver-a", "driver-b"]);
    db.close();
  });
});
