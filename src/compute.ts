import { createManifests, getValueViaSpec } from "@mpapenbr/iracelog-analysis/dist/stints/util";
import { ProviderData } from "./types";

// myCurrentData is already up to date
export const computeReplayInfo = (myData: ProviderData) => {
  const workManifest = createManifests(myData.manifests);
  const sTime = getValueViaSpec(myData.currentData?.session?.data, workManifest.session, "sessionTime");
  const sNum = getValueViaSpec(myData.currentData?.session?.data, workManifest.session, "sessionNum");

  // replay info is only available for race session.
  if (sNum !== myData.raceSession) {
    return;
  }

  myData.replayInfo.maxSessionTime = sTime;

  // myData.replayInfo.maxSessionTime = myData.currentData?.session?.data[0];
  if (!myData.raceStartMarkerFound) {
    // infoMsgs contains all info messages. We try to find the one for "Race start"
    const found = myData.currentData?.infoMsgs.find((v) => {
      const mType = getValueViaSpec(v.data, workManifest.message, "type");
      const mSubType = getValueViaSpec(v.data, workManifest.message, "subType");
      const mMessage = getValueViaSpec(v.data, workManifest.message, "msg");
      return mType == "Timing" && mSubType == "RaceControl" && mMessage == "Race start";
    });

    if (found) {
      console.log("found race start");
      myData.replayInfo.minTimestamp = found.timestamp;
      myData.replayInfo.minSessionTime = sTime; // myData.currentData?.session?.data[0]; // insider knowledge: sessionTime is the first entry
      myData.raceStartMarkerFound = true;
    } else {
      if (myData.replayInfo.minTimestamp === 0) {
        myData.replayInfo.minTimestamp = myData.currentData?.session?.timestamp ?? 0;
        myData.replayInfo.minSessionTime = sTime; // myData.currentData?.session?.data[0]; // insider knowledge: sessionTime is the first entry
      }
    }
  }
};
