import { BulkProcessor } from "@mpapenbr/iracelog-analysis";
import { Pool } from "pg";

const DB_URL = process.env.DB_URL || "postgresql://<user>:<passord>@<host>:<port>/<schema>";
const pool = new Pool({ connectionString: DB_URL, max: 10 });

export const processSomething = (eventId: number) => {
  return new Promise((resolve, reject) => {
    pool.query("select * from wampdata where event_id=$1", [eventId]).then((res) => {
      resolve(res.rows);
    });
  });
};

export const processEventWithDataData = (eventId: number) => {
  return new Promise((resolve, reject) => {
    pool.query("select * from event where id=$1", [eventId]).then((res) => {
      const manifests = res.rows[0].data.manifests;
      const proc = new BulkProcessor(manifests);
      pool.query("select * from wampdata where event_id=$1 order by data->'timestamp' asc", [eventId]).then((res) => {
        const procResult = proc.process(res.rows.map((v) => v.data));
        // console.log(procResult);
        resolve(procResult);
      });
    });
  });
};

// const start = new Date();
// processEventWithDataData(7).then((res) => {
//   console.log("time used: ", new Date().getTime() - start.getTime());
//   pool.end();
// });
