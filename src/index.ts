import { bulkProcessFile, readManifestsFromFile } from "@mpapenbr/iracelog-analysis/dist/backend";
import { defaultProcessRaceStateData } from "@mpapenbr/iracelog-analysis/dist/stints/types";
import autobahn from "autobahn";
import fs from "fs";
import { sprintf } from "sprintf-js";

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
    const result = bulkProcessFile(defaultProcessRaceStateData, manifests, dataFile);
    return result;
  };
  session.register("racelog.analysis.archive", processArchive);
};

conn.open();
