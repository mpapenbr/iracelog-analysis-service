import { BulkProcessor } from "@mpapenbr/iracelog-analysis";
import { bulkProcessFile, readManifestsFromFile } from "@mpapenbr/iracelog-analysis/dist/backend";
import { IManifests, IProcessRaceStateData } from "@mpapenbr/iracelog-analysis/dist/stints/types";
import { createManifests } from "@mpapenbr/iracelog-analysis/dist/stints/util";
import autobahn, { IEvent, ISubscription } from "autobahn";
import fs from "fs";
import { sprintf } from "sprintf-js";

const CROSSBAR_URL = process.env.CROSSBAR_URL || "ws://host.docker.internal:8090/ws";
const REALM = process.env.CROSSBAR_REALM || "racelog";
const USER = process.env.CROSSBAR_USER || "set CROSSBAR_USER";
const CREDENTIALS = process.env.CROSSBAR_CREDENTIALS || "set CROSSBAR_CREDENTIALS";

interface ProviderData {
  id: string;
  bulkProcessor: BulkProcessor;
  manifests: IManifests;
  currentData?: IProcessRaceStateData;
  dataSub?: ISubscription;
  managerSub?: ISubscription;
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
  let providerLookup = new Map<string, ProviderData>();

  const processArchive = (a: any[] | undefined) => {
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
    const regex = /racelog\.state\.(?<myId>.*)$/;
    const { myId } = details?.topic.match(regex)?.groups!;
    const myData = providerLookup.get(myId);
    if (!myData) {
      console.log("No data found for " + myId);
      return;
    }
    myData.currentData = myData.bulkProcessor.process([a[0]]);
  };

  const managerCommandHandler = (a: any[] | undefined, kwargs: any, details?: IEvent) => {
    if (!a) return;
    const regex = /racelog\.manager\.command\.(?<myId>.*)$/;
    const { myId } = details?.topic.match(regex)?.groups!;
    if (a[0] === "QUIT") {
      const myData = providerLookup.get(myId);
      if (myData) {
        if (myData.dataSub) session.unsubscribe(myData.dataSub);
        if (myData.managerSub) session.unsubscribe(myData.managerSub);
      }
    }
  };
  const processNewProvider = (a: any[] | undefined, kwargs: any, details?: IEvent) => {
    if (!a) return;
    console.log(kwargs);
    console.log(details);
    const { id, manifests } = a[0];
    const workManifest: IManifests = createManifests(manifests);
    let providerData = providerLookup.get(id);
    if (providerData === undefined) {
      providerData = { id: id, bulkProcessor: new BulkProcessor(workManifest), manifests: manifests };
      providerLookup.set(id, providerData);
      session.subscribe("racelog.state." + id, processForLiveAnalysis).then((sub) => {
        if (providerData) providerData.dataSub = sub;
      });
      session.subscribe("racelog.manager.command." + id, managerCommandHandler).then((sub) => {
        if (providerData) providerData.managerSub = sub;
      });
    }
  };

  session.register("racelog.analysis.live", getLiveAnalysis);
  session.register("racelog.analysis.archive", processArchive);
  session.subscribe("racelog.manager.provider", processNewProvider);
};

conn.open();
