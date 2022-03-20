import { BulkProcessor } from "@mpapenbr/iracelog-analysis/dist/stints/bulkProcessor";
import { createManifests } from "@mpapenbr/iracelog-analysis/dist/stints/util";
import { IPayloadData, IPayloadInfo, ProviderData } from "./types";

export const createProviderData = (payload: IPayloadData): ProviderData => {
  const workManifest = createManifests(payload.manifests);
  const providerData = {
    id: payload.eventKey,
    bulkProcessor: new BulkProcessor(workManifest),
    manifests: payload.manifests,
    lastUpdate: new Date(),
    replayInfo: { minSessionTime: 0, maxSessionTime: 0, minTimestamp: 0 },
    raceStartMarkerFound: false,
    raceSession: getRaceSession(payload.info),
  };
  return providerData;
};

const getRaceSession = (info: IPayloadInfo): number => {
  return info.sessions.find((v) => v.name === "RACE")?.num ?? 0;
};
