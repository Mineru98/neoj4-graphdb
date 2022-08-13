import "dotenv/config";
import TSON from "typescript-json";
import { driver, session, auth, Session } from "neo4j-driver";
import express, { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

interface IRes {
    code: number;
    msg: string;
}

const converter: any = (records: any[]) =>
    records.map((item: any) => Object.keys(item._fieldLookup).map((key: string) => item._fields[item._fieldLookup[key]])).flatMap((item) => item);

const converterWithRelationShip: any = (records: any[]) =>
    records
        .map((item: any) => Object.keys(item._fieldLookup).map((key: string) => item._fields[item._fieldLookup[key]]))
        .map((item) => {
            return {
                origin: item[0],
                relationShip: item[1],
                join: item[2],
            };
        });

app.use("/graph", (req: any, res: Response, next: NextFunction) => {
    const _driver = driver(
        `bolt://${process.env.NEO4J_HOST}:${process.env.NEO4J_PORT}`,
        auth.basic(process.env.NEO4J_USER as string, process.env.NEO4J_PW as string)
    );
    if (req.method === "GET") {
        // If you use Rx,
        // req.db_session = _driver.rxSession({ defaultAccessMode: session.READ });
        req.db_session = _driver.session({ database: process.env.NEO4J_DB, defaultAccessMode: session.READ });
    } else {
        req.db_session = _driver.session({ defaultAccessMode: session.WRITE });
    }
    req.graphDB = _driver;
    next();
});

app.get("/welcome", (req: Request, res: Response, next: NextFunction) => {
    const result = TSON.create<IRes>({ code: 200, msg: "good" });
    res.status(200).json(result);
});

app.get("/graph/labels", async (req: any, res: Response, next: NextFunction) => {
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        _session
            .run("MATCH (n) RETURN DISTINCT labels(n) AS Label")
            .then((result) => {
                res.status(200).json({
                    data: converter(result.records),
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(400).json({});
            })
            .then(() => _session.close());
    } else {
        res.status(400).json({});
    }
});

app.get("/graph/all", async (req: any, res: Response, next: NextFunction) => {
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        _session
            .run("MATCH (n)<-[r]-(m) RETURN n, type(r), m;")
            .then((result) => {
                res.status(200).json({
                    data: converterWithRelationShip(result.records),
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(400).json({});
            })
            .then(() => _session.close());
    } else {
        res.status(400).json({});
    }
});

app.get("/graph/:id", async (req: any, res: Response, next: NextFunction) => {
    const { id } = req.params;
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        _session
            .run(`MATCH (n) WHERE ID(n) = ${id} RETURN n`)
            .then((result) => {
                res.status(201).json({
                    data: converter(result.records),
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(400).json({});
            })
            .then(() => _session.close());
    } else {
        res.status(400).json({});
    }
});

app.post("/graph", async (req: any, res: Response, next: NextFunction) => {
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        const objs: string[] = Object.keys(req.body).filter((key: string) => !(key === "labels"));
        const labels = (req.body.labels as string)
            .trim()
            .split(",")
            .map((key) => "`" + key + "`")
            .join(":");
        _session
            .run(
                `CREATE (n:${labels}{${objs
                    .map((key: string) => {
                        if (typeof req.body[key] === typeof "") {
                            return `${key}:"${req.body[key]}"`;
                        } else {
                            return `${key}:${req.body[key]}`;
                        }
                    })
                    .join(",")}}) RETURN n`
            )
            .then((result) => {
                res.status(201).json({
                    data: converter(result.records),
                });
            })
            .catch((error) => {
                console.log(error);
                res.status(400).json({});
            })
            .then(() => _session.close());
    } else {
        res.status(400).json({});
    }
});

app.put("/graph/:id", async (req: any, res: Response, next: NextFunction) => {
    const { id } = req.params;
    let { init } = req.query;
    init = (await init) === "true" ? true : false;
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        const objs: string[] = Object.keys(req.body).filter((key: string) => !(key === "labels"));
        const labels = (req.body.labels as string)
            .trim()
            .split(",")
            .map((key) => "`" + key + "`")
            .join(":");
        try {
            const step0 = await _session.run(`MATCH (n) WHERE ID(n) = ${id} RETURN n;`);
            if (step0) {
                await _session.run(`MATCH (n) WHERE ID(n) = ${id} REMOVE n:${converter(step0.records)[0]["labels"].join(":")}`);
            }
            if (init) {
                await _session.run(`MATCH (n) WHERE ID(n) = ${id} set n = {}`);
            }
            await _session.run(`MATCH (n) WHERE ID(n) = ${id} SET n:${labels} RETURN n;`);
            const result = await _session.run(
                `MATCH (n) WHERE ID(n) = ${id} SET n += {${objs
                    .map((key: string) => {
                        if (typeof req.body[key] === typeof "") {
                            return `${key}:"${req.body[key]}"`;
                        } else {
                            return `${key}:${req.body[key]}`;
                        }
                    })
                    .join(",")}} RETURN n;`
            );
            res.status(200).json({ data: converter(result.records)[0] });
        } catch (error) {
            console.error(error);
            res.status(400).json({});
        } finally {
            _session.close();
        }
    } else {
        res.status(400).json({});
    }
});

app.delete("/graph/all", async (req: any, res: Response, next: NextFunction) => {
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        _session
            .run(`MATCH (n) DETACH DELETE n;`)
            .then(() => {
                res.status(200).json();
            })
            .catch((error) => {
                console.log(error);
                res.status(400).json({});
            })
            .then(() => _session.close());
    } else {
        res.status(400).json({});
    }
});

app.delete("/graph/:id", async (req: any, res: Response, next: NextFunction) => {
    const { id } = req.params;
    if (req["graphDB"]) {
        const _session: Session = req["db_session"];
        _session
            .run(`MATCH (n) WHERE ID(n) = ${id} OPTIONAL MATCH (n)-[r]-() DELETE r, n;`)
            .then(() => {
                res.status(200).json();
            })
            .catch((error) => {
                console.log(error);
                res.status(400).json({});
            })
            .then(() => _session.close());
    } else {
        res.status(400).json({});
    }
});

app.listen(process.env.PORT, () => {
    console.log(`
  ################################################
  🛡️  Server listening on port: 8080🛡️
  ################################################
`);
});
