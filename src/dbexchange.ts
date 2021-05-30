import { BulkProcessor } from "@mpapenbr/iracelog-analysis";
import { createManifests } from "@mpapenbr/iracelog-analysis/dist/stints/util";
import { Pool } from "pg";

const DB_URL = process.env.DB_URL || "postgresql://<user>:<password>@<host>:<port>/<schema>";

const pool = new Pool({ connectionString: DB_URL, max: 10 });

export const processSomething = (eventId: number) => {
  return new Promise((resolve, reject) => {
    pool.query("select * from wampdata where event_id=$1", [eventId]).then((res) => {
      resolve(res.rows);
    });
  });
};

export const storeAnalysisData = (eventKey: string, data: any) => {
  pool.connect((err, client, done) => {
    const shouldAbort = (err: Error) => {
      if (err) {
        console.log(err);
        done();
      }
      return !!err;
    };
    client.query("BEGIN", (err) => {
      if (shouldAbort(err)) return;
      console.log("Checking event id for event " + eventKey);
      client.query("select id from event where event_key=$1", [eventKey], (err: Error, res: any) => {
        if (shouldAbort(err)) return;
        const eventId = res.rows[0].id;
        console.log("event id is " + eventId);
        client.query(
          "insert into analysis (event_id,data) values ($1,$2::jsonb)",
          [eventId, JSON.stringify(data)],
          (err: Error, res: any) => {
            if (shouldAbort(err)) return;
            client.query("COMMIT", (err) => done());
          }
        );
      });
    });
  });
};

export const getArchivedAnalysis = (eventKey: string) => {
  return new Promise((resolve, reject) => {
    pool
      .query("select a.data from analysis a join event e on a.event_id=e.id where e.event_key=$1", [eventKey])
      .then((res) => {
        resolve(res.rows[0].data);
      });
  });
};

export const getArchivedAnalysisSync = async (eventKey: string) => {
  const { rows } = await pool.query(
    "select a.data from analysis a join event e on a.event_id=e.id where e.event_key=$1",
    [eventKey]
  );

  return rows[0].data;
};

export const processEvent = (eventKey: string) => {
  return new Promise((resolve, reject) => {
    pool.query("select * from event where event_key=$1", [eventKey]).then((res) => {
      const manifests = createManifests(res.rows[0].data.manifests);

      const proc = new BulkProcessor(manifests);
      pool
        .query("select * from wampdata where event_id=$1 order by data->'timestamp' asc ", [res.rows[0].id])
        .then((res) => {
          //
          const procResult = proc.process(res.rows.map((v) => v.data));
          resolve(procResult);
        });
    });
  });
};

// const eventKeys = ["1", "3", "neo", "68d4ff7adbb3412b8da2ab53daf01453", "26ceac390dcac80d439992c98b0a9db8"];
// eventKeys.forEach((eventKey) => {
//   console.log("Processing " + eventKey);
//   const start = new Date();
//   processEvent(eventKey).then((res) => {
//     // console.log(res);
//     storeAnalysisData(eventKey, res);

//     console.log("process time used: ", new Date().getTime() - start.getTime());
//   });
// });
