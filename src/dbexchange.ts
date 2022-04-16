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

export const storeAnalysisData = async (eventKey: string, data: any) => {
  let client = await pool.connect();
  try {
    await client.query("BEGIN");
    let result = await client.query("select id from event where event_key=$1", [eventKey]);
    const eventId = result.rows[0].id;
    result = await client.query("select id from analysis where event_id=$1", [eventId]);
    if (result.rows.length === 0) {
      await client.query("insert into analysis (event_id,data) values ($1,$2::jsonb)", [eventId, JSON.stringify(data)]);
    } else {
      await client.query("update analysis set data = $2::jsonb where event_id=$1", [eventId, JSON.stringify(data)]);
    }
    await client.query("COMMIT");
  } finally {
    client.release();
  }
};

export const eventIdToEventKey = async (eventId: number): Promise<string | undefined> => {
  let client = await pool.connect();
  try {
    await client.query("BEGIN");
    let result = await client.query("select event_key from event where id=$1", [eventId]);
    await client.query("COMMIT");
    const eventKey = result.rowCount > 0 ? result.rows[0].event_key : undefined;
    return eventKey;
  } finally {
    client.release();
  }
};

export const updateReplayInfoOnEvent = (eventKey: string, replayInfo: any) => {
  pool.connect((err, client, done) => {
    const shouldAbort = (err: Error) => {
      if (err) {
        console.log(err);
        done();
      }
      return !!err;
    };
    client.query("BEGIN", (err) => {
      const data = { replayInfo: replayInfo };
      client.query(
        "update event set data = mgm_jsonb_merge(data, $2::jsonb) where event_key=$1",
        [eventKey, JSON.stringify(data)],
        (err: Error, res: any) => {
          if (shouldAbort(err)) return;
          client.query("COMMIT", (err) => done());
        }
      );
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

export const processEvent = async (eventKey: string) => {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    let res = await client.query("select * from event where event_key=$1", [eventKey]);
    if (res.rowCount === 0) throw new Error("no data found for eventKey " + eventKey);

    const manifests = createManifests(res.rows[0].data.manifests);
    const eventId = res.rows[0].id;
    res = await client.query("select * from wampdata where event_id=$1 order by data->'timestamp' asc ", [eventId]);
    const proc = new BulkProcessor(manifests);
    const procResult = proc.process(res.rows.map((v) => v.data));
    await client.query("COMMIT");
    return procResult;
  } finally {
    client.release();
  }
};
