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
// Rafiki's own routes take small bodies (the 100kb default). The apps mounted
// at /interschool and /ambassadors parse their own (room for uploaded logos,
// photos and offline sync batches), so their requests pass through untouched here.
const jsonBody = express.json();
const formBody = express.urlencoded({ extended: true });
const ownsBody = (p: string) => p.startsWith("/interschool") || p.startsWith("/ambassadors");
app.use((req, res, next) => (ownsBody(req.path) ? next() : jsonBody(req, res, next)));
app.use((req, res, next) => (ownsBody(req.path) ? next() : formBody(req, res, next)));

app.use("/api", router);

export default app;
