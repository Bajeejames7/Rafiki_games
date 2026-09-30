import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Rafiki's own routes take small bodies (the 100kb default). The interschool
// app mounted at /interschool parses its own, with room for uploaded logos and
// photos, so its requests pass through untouched here.
const jsonBody = express.json();
const formBody = express.urlencoded({ extended: true });
app.use((req, res, next) => (req.path.startsWith("/interschool") ? next() : jsonBody(req, res, next)));
app.use((req, res, next) => (req.path.startsWith("/interschool") ? next() : formBody(req, res, next)));

app.use("/api", router);

export default app;
