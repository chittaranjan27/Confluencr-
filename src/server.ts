import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app.js";
import { initDatabase, closeDatabase } from "./config/database.js";

const PORT = process.env.PORT || 3000;

// Initialize database
const db = initDatabase();
console.log("Database initialized successfully with WAL mode.");

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Ledger API Server running on: http://localhost:${PORT}`);
  console.log(` Interactive Swagger UI:        http://localhost:${PORT}/docs`);
  console.log(` Live Dashboard & Playground:  http://localhost:${PORT}/`);
  console.log(`=======================================================`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("\nGracefully shutting down Ledger API server...");
  server.close(() => {
    closeDatabase();
    console.log("Database connection closed. Goodbye!");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
