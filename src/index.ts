import { BulkProcessor } from "@mpapenbr/iracelog-analysis";
import { bulkProcessFile, readManifestsFromFile } from "@mpapenbr/iracelog-analysis/dist/backend";
import { IManifests, IProcessRaceStateData } from "@mpapenbr/iracelog-analysis/dist/stints/types";
import { createManifests } from "@mpapenbr/iracelog-analysis/dist/stints/util";
import autobahn, { IEvent, ISubscription } from "autobahn";
import fs from "fs";
import { sprintf } from "sprintf-js";
import { getArchivedAnalysis, storeAnalysisData, updateReplayInfoOnEvent } from "./dbexchange";

const CROSSBAR_URL = process.env.CROSSBAR_URL || "ws://host.docker.internal:8090/ws";
const REALM = process.env.CROSSBAR_REALM || "racelog";
const USER = process.env.CROSSBAR_USER || "set CROSSBAR_USER";
const CREDENTIALS = process.env.CROSSBAR_CREDENTIALS || "set CROSSBAR_CREDENTIALS";

interface IReplayInfo {
  minSessionTime: number;
  maxSessionTime: number;
  minTimestamp: number;
}
interface ProviderData {
  id: string;
  bulkProcessor: BulkProcessor;
  manifests: IManifests;
  currentData?: IProcessRaceStateData;
  dataSub?: ISubscription;
  managerSub?: ISubscription;
  lastUpdate: Date;
  replayInfo: IReplayInfo;
  raceStartMarkerFound: boolean;
}

var conn = new autobahn.Connection({
  url: CROSSBAR_URL,
  realm: REALM,
  authmethods: ["ticket"],
  authid: USER,
  onchallenge: () => CREDENTIALS,
});
conn.onopen = (session: autobahn.Session, details: any) => {
  console.log("connected to crossbar server " + CROSSBAR_URL + " as " + USER);
  console.log("using this db " + process.env.DB_URL);
  let providerLookup = new Map<string, ProviderData>();

  const processArchiveFile = (a: any[] | undefined) => {
    if (!a) {
      return { error: "need an id" };
    }

    const manifestFile = sprintf("data/manifest-%s.json", a[0]);
    const dataFile = sprintf("data/data-%s.json", a[0]);
    if (!fs.existsSync(manifestFile)) {
      return { error: manifestFile + " not found" };
    }
    if (!fs.existsSync(dataFile)) {
      return { error: dataFile + " not found" };
    }
    const manifests = readManifestsFromFile(manifestFile);
    const result = bulkProcessFile(manifests, dataFile);
    return result;
  };

  const processArchiveDb = (a: any[] | undefined) => {
    if (!a) {
      return { error: "need an id" };
    }
    // const result = getArchivedAnalysisSync(a[0]);
    const result = getArchivedAnalysis(a[0]);
    return result;
  };

  const getLiveAnalysis = (a: any[] | undefined) => {
    if (!a) {
      return { error: "need an id" };
    }
    const data = providerLookup.get(a[0]);
    if (!data) {
      console.log("no data for " + a[0]);
      return {};
    }
    if (data) {
      return { processedData: data.currentData, manifests: data.manifests } || {};
    }
  };

  const processForLiveAnalysis = (a: any[] | undefined, kwargs: any, details?: IEvent) => {
    if (!a || !details) return; // no data or meta data -> no processing
    // the id is present in the topic
    // console.log(details);
    const regex = /racelog\.public\.live\.state\.(?<myId>.*)$/;
    const { myId } = details?.topic.match(regex)?.groups!;
    const myData = providerLookup.get(myId);
    if (!myData) {
      console.log("No data found for " + myId);
      return;
    }
    myData.currentData = myData.bulkProcessor.process([a[0]]);
    computeReplayInfo(myData);
    const nowDate = new Date();
    if (nowDate.getTime() - myData.lastUpdate.getTime() > 10000) {
      // wenn start gefunden, prima, dann minTs/St auf gefundenen Wert
      // store every 10s

      // console.log("now: " + nowDate + " lastUpdate: " + myData.lastUpdate.getTime());
      console.log(nowDate.toISOString() + ": storing analysis data");
      storeAnalysisData(myId, myData.currentData);
      updateReplayInfoOnEvent(myId, myData.replayInfo);
      myData.lastUpdate = new Date();
    }
  };

  // myCurrentData is already up to date
  const computeReplayInfo = (myData: ProviderData) => {
    myData.replayInfo.maxSessionTime = myData.currentData?.session?.data[0];
    if (!myData.raceStartMarkerFound) {
      //TODO: get attributes by manifests to get rid of magic indexes ;)

      const found = myData.currentData?.infoMsgs.find((v) => {
        // console.log(v);
        return v.data.find((m: any[]) => {
          // console.log(m);
          // console.log(m[m.length - 1]);
          return m[0] == "Timing" && m[1] == "RaceControl" && m[m.length - 1] == "Race start";
        });
      });

      if (found) {
        console.log("found race start");
        myData.replayInfo.minTimestamp = found.timestamp;
        myData.replayInfo.minSessionTime = myData.currentData?.session?.data[0]; // insider knowledge: sessionTime is the first entry
        myData.raceStartMarkerFound = true;
      } else {
        if (myData.replayInfo.minTimestamp === 0) {
          myData.replayInfo.minTimestamp = myData.currentData?.session?.timestamp ?? 0;
          myData.replayInfo.minSessionTime = myData.currentData?.session?.data[0]; // insider knowledge: sessionTime is the first entry
        }
      }
    }
  };
  const managerCommandHandler = (a: any[] | undefined, kwargs: any, details?: IEvent) => {
    if (!a) return;
    const regex = /racelog\.manager\.command\.(?<myId>.*)$/;
    const { myId } = details?.topic.match(regex)?.groups!;
    if (a[0] === "QUIT") {
      const myData = providerLookup.get(myId);
      if (myData) {
        storeAnalysisData(myId, myData.currentData);
        if (myData.dataSub) session.unsubscribe(myData.dataSub);
        if (myData.managerSub) session.unsubscribe(myData.managerSub);
      }
    }
  };

  const processNewProvider = (payload: any) => {
    const { eventKey, manifests } = payload;

    const workManifest: IManifests = createManifests(manifests);
    let providerData = providerLookup.get(eventKey);
    if (providerData === undefined) {
      providerData = {
        id: eventKey,
        bulkProcessor: new BulkProcessor(workManifest),
        manifests: manifests,
        lastUpdate: new Date(),
        replayInfo: { minSessionTime: 0, maxSessionTime: 0, minTimestamp: 0 },
        raceStartMarkerFound: false,
      };
      providerLookup.set(eventKey, providerData);
      session.subscribe("racelog.public.live.state." + eventKey, processForLiveAnalysis).then((sub) => {
        if (providerData) providerData.dataSub = sub;
      });
    }
  };
  const processProviderRemoval = (eventKey: string) => {
    const myData = providerLookup.get(eventKey);
    if (myData) {
      storeAnalysisData(eventKey, myData.currentData);
      if (myData.dataSub) session.unsubscribe(myData.dataSub);
      providerLookup.delete(eventKey);
    }
  };
  const processProviderMessage = (a: any[] | undefined, kwargs: any, details?: IEvent) => {
    if (!a) return;
    console.log(kwargs);
    console.log(details);
    console.log(a);

    switch (a[0].type) {
      case 1: // announce new provider
        processNewProvider(a[0].payload);
        break;
      case 2: // announce provider removal
        processProviderRemoval(a[0].payload);
        break;
    }
  };

  session.register("racelog.public.live.get_event_analysis", getLiveAnalysis);
  // session.register("racelog.analysis.archive", processArchiveDb);
  session.subscribe("racelog.manager.provider", processProviderMessage);
};

conn.open();
