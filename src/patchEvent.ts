import { Pool } from "pg";
import { processEvent, storeAnalysisData } from "./dbexchange";

const DB_URL = process.env.DB_URL || "postgresql://<user>:<password>@<host>:<port>/<schema>";
const pool = new Pool({ connectionString: DB_URL, max: 10 });

const processPatches = async () => {
  const client = await pool.connect();
  // await client.query("BEGIN");
  try {
    let res = await client.query("select id,event_key from event");
    console.log(res.rows.length);
    console.log(res.rows);
    for (var i = 0; i < res.rows.length; i++) {
      var row = res.rows[i];

      // const { id, event_key } = row;
      // }
      // res.rows.forEach(async (row) => {
      console.log(row);
      const { id, event_key } = row;
      console.log(`${id}- ${event_key}`);
      let result = await processEvent(event_key);
      console.log("recieved result for " + event_key);
      await storeAnalysisData(event_key, result);
      console.log("stored result for " + event_key);
    }
    // await client.query("COMMIT");
  } finally {
    client.release();
  }
};

(async () => {
  await processPatches();
  console.log("Done");
})();
pool.end().then(() => console.log("Pool done"));
// ["7f4b055d7b2994d16b0e25116129dbc9"].forEach((eventKey) =>
//   processEvent(eventKey).then((result) => storeAnalysisData(eventKey, result))
// );
