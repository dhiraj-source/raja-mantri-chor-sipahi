import './env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { isAllowedOrigin, parseExtraOrigins } from './cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Plain WebSocket (ws) use ho raha hai, socket.io nahi.
  app.useWebSocketAdapter(new WsAdapter(app));
  // Dev me web (Vite, port 5173) localhost ya same-network IP se API call kar sake; baaki origins block.
  const extraOrigins = parseExtraOrigins(process.env.CORS_ORIGINS);
  app.enableCors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin, extraOrigins)),
  });
  // PORT: Railway/Render jaise hosts khud is env var se port assign karte hain.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`API running on http://localhost:${port} (WebSocket: ws://localhost:${port}/ws)`);
}

void bootstrap();
