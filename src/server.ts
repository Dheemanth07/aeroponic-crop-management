import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/client.js';

async function startServer() {
  const app = buildApp();

  try {
    const address = await app.listen({
      port: config.port,
      host: config.host
    });

    console.log(`=======================================================`);
    console.log(` AgResearch Labs API Server`);
    console.log(` Status  : Running on ${address}`);
    console.log(` Mode    : ${config.nodeEnv}`);
    console.log(` Database: ${config.databaseUrl}`);
    console.log(`=======================================================`);

    const shutdown = async () => {
      console.log('\nShutting down server gracefully...');
      await app.close();
      await closePool();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
