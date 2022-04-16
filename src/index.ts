import { bulkProcessFile, readManifestsFromFile } from "@mpapenbr/iracelog-analysis/dist/backend";
import autobahn, { IEvent } from "autobahn";
import fs from "fs";
import { sprintf } from "sprintf-js";
import { computeReplayInfo } from "./compute";
import {
  eventIdToEventKey,
  getArchivedAnalysis,
  processEvent,
  storeAnalysisData,
  updateReplayInfoOnEvent,
} from "./dbexchange";
import { IPayloadData, ProviderData } from "./types";
import { createProviderData } from "./util";
// import { ProviderData } from "./types";

const CROSSBAR_URL = process.env.CROSSBAR_URL || "ws://host.docker.internal:8090/ws";
const REALM = process.env.CROSSBAR_REALM || "racelog";
const USER = process.env.CROSSBAR_USER || "set CROSSBAR_USER";
const CREDENTIALS = process.env.CROSSBAR_CREDENTIALS || "set CROSSBAR_CREDENTIALS";

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

  /**
   * callback for endpoint racelog.public.live.get_event_analysis
   * @param a wamp argument array. expect an id on a[0]
   * @returns struct with { processedData: IProcessRaceStateData, manifests: IShortManifests }
   */
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

  /**
   * call
   * @param a
   * @returns
   */
  const reprocessEvent = async (a: any[] | undefined, kwargs: any) => {
    let { eventId, eventKey } = kwargs;

    if (eventId === undefined && eventKey === undefined) {
      return { error: "eventId or eventKey must be provided" };
    }
    if (eventKey === undefined) {
      eventKey = await eventIdToEventKey(eventId);
      if (eventKey === undefined) {
        return { error: "no event for id " + eventId + " found" };
      }
    }
    const data = await processEvent(eventKey);
    await storeAnalysisData(eventKey, data);
    return { message: `event ${eventKey} processed` };
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

  const processNewProvider = (payload: IPayloadData) => {
    const { eventKey } = payload;

    console.log(JSON.stringify(payload));
    let providerData = providerLookup.get(eventKey);
    if (providerData === undefined) {
      providerData = createProviderData(payload);
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
      updateReplayInfoOnEvent(eventKey, myData.replayInfo);
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
  session.register("racelog.admin.event.process", reprocessEvent);
  // session.register("racelog.analysis.archive", processArchiveDb);
  session.subscribe("racelog.manager.provider", processProviderMessage);
};

conn.open();
