import { defaultProcessRaceStateData, IProcessRaceStateData } from "@mpapenbr/iracelog-analysis/dist/stints/types";
import { computeReplayInfo } from "../compute";
import { IShortManifests, ProviderData } from "../types";
import { createProviderData } from "../util";

describe("computeReplayInfo", () => {
  // we use reduced manifest here for testing
  const manifests: IShortManifests = {
    car: [],
    message: ["type", "subType", "msg"],
    pit: [],
    session: ["sessionTime", "sessionNum"],
  };
  const sampleProviderData: ProviderData = createProviderData({
    eventKey: "dummy",
    manifests,
    info: {
      name: "dummy",
      sectors: [],
      trackId: 1,
      eventTime: "2020-01-01T12:00:00",
      sessions: [
        { type: "Race", num: 1, laps: -1, time: -1, name: "RACE" },
        { type: "Open Qualify", num: 0, laps: -1, time: -1, name: "QUALIFY" },
      ],
    },
  });

  it("check quali session", () => {
    const currentData: IProcessRaceStateData = {
      ...defaultProcessRaceStateData,
      session: { msgType: 1, timestamp: 1, data: [12, 0] },
    };
    const data = { ...sampleProviderData, currentData };
    computeReplayInfo(data);
    expect(data.replayInfo.maxSessionTime).toEqual(0);
    expect(data.raceStartMarkerFound).toEqual(false);
  });

  it("check race session (part maxSessionTime)", () => {
    const currentData: IProcessRaceStateData = {
      ...defaultProcessRaceStateData,
      session: { msgType: 1, timestamp: 1, data: [12, 1] },
    };
    const data = { ...sampleProviderData, currentData };
    computeReplayInfo(data);
    expect(data.replayInfo.maxSessionTime).toEqual(12);
    expect(data.raceStartMarkerFound).toEqual(false);
  });

  it("check race session (complete)", () => {
    const currentData: IProcessRaceStateData = {
      ...defaultProcessRaceStateData,
      session: { msgType: 1, timestamp: 1, data: [12, 1] },
      infoMsgs: [{ msgType: 1, timestamp: 11, data: ["Timing", "RaceControl", "Race start"] }],
    };
    const data = { ...sampleProviderData, currentData };
    computeReplayInfo(data);
    expect(data.replayInfo.maxSessionTime).toEqual(12);
    expect(data.replayInfo.minTimestamp).toEqual(11);
    expect(data.raceStartMarkerFound).toEqual(true);
  });

  it("check find first race start", () => {
    const currentData: IProcessRaceStateData = {
      ...defaultProcessRaceStateData,
      session: { msgType: 1, timestamp: 1, data: [12, 1] },
      infoMsgs: [
        { msgType: 1, timestamp: 11, data: ["Timing", "RaceControl", "Race start"] },
        { msgType: 1, timestamp: 22, data: ["Timing", "RaceControl", "Race start"] },
      ],
    };
    const data = { ...sampleProviderData, currentData };
    computeReplayInfo(data);
    expect(data.replayInfo.maxSessionTime).toEqual(12);
    expect(data.replayInfo.minTimestamp).toEqual(11);
    expect(data.raceStartMarkerFound).toEqual(true);
  });

  it("standard step after race start detection", () => {
    // prepare
    const currentData: IProcessRaceStateData = {
      ...defaultProcessRaceStateData,
      session: { msgType: 1, timestamp: 1, data: [13, 1] },
    };
    const data: ProviderData = {
      ...sampleProviderData,
      currentData,
      raceStartMarkerFound: true,
      replayInfo: { minTimestamp: 11, minSessionTime: 12, maxSessionTime: 12 },
    };

    computeReplayInfo(data);
    // check
    expect(data.raceStartMarkerFound).toEqual(true);
    expect(data.replayInfo.minTimestamp).toEqual(11);
    expect(data.replayInfo.minSessionTime).toEqual(12);
    expect(data.replayInfo.maxSessionTime).toEqual(13);
  });
});
