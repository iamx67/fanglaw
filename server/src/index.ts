import "dotenv/config";
import express, { type Request, type Response } from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CatRoom } from "./rooms/CatRoom.js";
import { AuthStoreError, authStore } from "./persistence/AuthStore.js";
import {
  PlayerIdentityStoreError,
  parseStoredAppearanceJson,
  playerIdentityStore,
  type PlayerIdentity,
} from "./persistence/PlayerIdentityStore.js";

const PORT = Number(process.env.PORT ?? 2567);
const PUBLIC_URL = process.env.PUBLIC_URL?.trim() || `http://localhost:${PORT}`;
const WORLD_ROOM_NAME = process.env.WORLD_ROOM_NAME?.trim() || "cats";
const WORLD_ROOM_OPTIONS = {
  worldKey: process.env.WORLD_KEY?.trim() || "main_world",
  persistent: true,
};

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      next();
    });

    app.options("*", (_req: Request, res: Response) => {
      res.sendStatus(204);
    });

    app.use(express.json());

    app.get("/", (_req: Request, res: Response) => {
      res.json({
        ok: true,
        room: WORLD_ROOM_NAME,
        transport: "ws",
        world: "persistent",
        publicUrl: PUBLIC_URL,
        matchmaking: `/matchmake/join/${WORLD_ROOM_NAME}`,
      });
    });

    app.post("/api/register", async (req: Request, res: Response) => {
      try {
        const registration = await authStore.register({
          email: readString(req.body?.email),
          password: readString(req.body?.password),
          characterName: readString(req.body?.characterName),
        });

        const profile = playerIdentityStore.getOrCreateProfile(
          registration.character.characterId,
          registration.character.name,
          "account",
        );

        await authStore.flush();
        await playerIdentityStore.flush();

        res.status(201).json(buildAuthResponse(registration.account, registration.character, profile, registration.session.token));
      } catch (error) {
        respondWithApiError(res, error);
      }
    });

    app.post("/api/login", async (req: Request, res: Response) => {
      try {
        const login = await authStore.login({
          email: readString(req.body?.email),
          password: readString(req.body?.password),
        });

        const profile = playerIdentityStore.getOrCreateProfile(
          login.character.characterId,
          login.character.name,
          "account",
        );

        await authStore.flush();
        await playerIdentityStore.flush();

        res.json(buildAuthResponse(login.account, login.character, profile, login.session.token));
      } catch (error) {
        respondWithApiError(res, error);
      }
    });

    app.get("/api/me", async (req: Request, res: Response) => {
      try {
        const sessionToken = extractBearerToken(req);
        const auth = await authStore.getAuthBySessionToken(sessionToken);
        const profile = playerIdentityStore.getOrCreateProfile(auth.characterId, auth.characterName, "account");

        res.json(buildAuthResponse(
          {
            accountId: auth.accountId,
            email: auth.email,
          },
          {
            characterId: auth.characterId,
            name: auth.characterName,
          },
          profile,
          auth.sessionToken,
        ));
      } catch (error) {
        respondWithApiError(res, error);
      }
    });

    app.post("/api/me/appearance", async (req: Request, res: Response) => {
      try {
        const sessionToken = extractBearerToken(req);
        const auth = await authStore.getAuthBySessionToken(sessionToken);
        playerIdentityStore.getOrCreateProfile(auth.characterId, auth.characterName, "account");
        const profile = playerIdentityStore.saveAppearanceOnce(auth.characterId, req.body?.appearance);

        await playerIdentityStore.flush();

        res.json(buildAuthResponse(
          {
            accountId: auth.accountId,
            email: auth.email,
          },
          {
            characterId: auth.characterId,
            name: auth.characterName,
          },
          profile,
          auth.sessionToken,
        ));
      } catch (error) {
        respondWithApiError(res, error);
      }
    });
  },
});

gameServer.define(WORLD_ROOM_NAME, CatRoom);

await authStore.load();
await playerIdentityStore.load();
await gameServer.listen(PORT);

const worldRoom = await matchMaker.createRoom(WORLD_ROOM_NAME, WORLD_ROOM_OPTIONS);

console.log(`Server running on ${PUBLIC_URL}`);
console.log(`World room "${WORLD_ROOM_NAME}" is ready (${worldRoom.roomId})`);

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function buildAuthResponse(
  account: { accountId: string; email: string },
  character: { characterId: string; name: string },
  profile: Pick<PlayerIdentity, "appearanceJson" | "appearanceLocked">,
  sessionToken: string,
) {
  return {
    ok: true,
    sessionToken,
    account: {
      accountId: account.accountId,
      email: account.email,
    },
    character: {
      characterId: character.characterId,
      name: character.name,
      appearanceLocked: profile.appearanceLocked,
      appearance: parseStoredAppearanceJson(profile.appearanceJson),
    },
  };
}

function extractBearerToken(req: Request) {
  const authHeader = req.header("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new AuthStoreError("Authorization token is missing", "SESSION_NOT_FOUND");
  }

  return authHeader.slice("Bearer ".length).trim();
}

function respondWithApiError(res: Response, error: unknown) {
  if (error instanceof AuthStoreError) {
    const status = getAuthErrorStatus(error.code);
    res.status(status).json({
      ok: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof PlayerIdentityStoreError) {
    const status = getPlayerProfileErrorStatus(error.code);
    res.status(status).json({
      ok: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    ok: false,
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}

function getPlayerProfileErrorStatus(code: PlayerIdentityStoreError["code"]) {
  switch (code) {
    case "APPEARANCE_LOCKED":
      return 409;
    case "INVALID_APPEARANCE":
      return 400;
    default:
      return 400;
  }
}

function getAuthErrorStatus(code: AuthStoreError["code"]) {
  switch (code) {
    case "EMAIL_TAKEN":
    case "NAME_TAKEN":
      return 409;
    case "INVALID_EMAIL":
    case "INVALID_PASSWORD":
    case "INVALID_NAME":
      return 400;
    case "AUTH_FAILED":
    case "SESSION_NOT_FOUND":
      return 401;
    default:
      return 400;
  }
}
