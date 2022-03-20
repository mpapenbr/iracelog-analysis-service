import { BulkProcessor } from "@mpapenbr/iracelog-analysis";
import { IProcessRaceStateData } from "@mpapenbr/iracelog-analysis/dist/stints/types";
import { ISubscription } from "autobahn";

export interface IReplayInfo {
  minSessionTime: number;
  maxSessionTime: number;
  minTimestamp: number;
}

export interface IShortManifests {
  car: string[];
  pit: string[];
  message: string[];
  session: string[];
}

export interface ProviderData {
  id: string;
  bulkProcessor: BulkProcessor;
  manifests: IShortManifests;
  currentData?: IProcessRaceStateData;
  dataSub?: ISubscription;
  managerSub?: ISubscription;
  lastUpdate: Date;
  replayInfo: IReplayInfo;
  raceSession: number; // contains the number of the RACE session
  raceStartMarkerFound: boolean;
}

export interface ISector {
  SectorNum: number;
  SectorStartPct: number;
}

export interface ISession {
  num: number;
  laps: number;
  name: string;
  time: number;
  type: string;
}

export interface IPayloadInfo {
  name: string; // eventName
  sectors: ISector[];
  trackId: number;
  eventTime: string; // iso date format
  sessions: ISession[];
}

export interface IPayloadData {
  eventKey: string;
  info: IPayloadInfo;
  manifests: IShortManifests;
}
