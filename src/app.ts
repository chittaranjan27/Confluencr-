import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { createLedgerRouter } from "./routes/ledger.routes.js";
import { swaggerDocument } from "./docs/swagger.js";
import { LedgerService } from "./services/ledger.service.js";
import { LedgerController } from "./controllers/ledger.controller.js";

export function createApp(service?: LedgerService): Application {
  const app = express();

  // Core middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Swagger Documentation
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Mount API Router
  const controller = new LedgerController(service);
  const router = createLedgerRouter(controller);
  app.use("/api", router);

  // Serve static UI assets
  const publicDir = path.resolve(process.cwd(), "src/public");
  app.use(express.static(publicDir));

  // Fallback 404 handler for API routes
  app.use("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({
      error: "ENDPOINT_NOT_FOUND",
      message: "The requested API endpoint does not exist."
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Internal Server Error:", err);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred."
    });
  });

  return app;
}
