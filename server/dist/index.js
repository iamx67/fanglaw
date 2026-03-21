import "dotenv/config";
import express, {} from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CatRoom } from "./rooms/CatRoom.js";
import { AuthStoreError, PlayerIdentityStoreError, accountsService, charactersService, } from "./services/index.js";
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
        app.options("*", (_req, res) => {
            res.sendStatus(204);
        });
        app.use(express.json());
        app.get("/", (_req, res) => {
            res.json({
                ok: true,
                room: WORLD_ROOM_NAME,
                transport: "ws",
                world: "persistent",
                publicUrl: PUBLIC_URL,
                matchmaking: `/matchmake/join/${WORLD_ROOM_NAME}`,
            });
        });
        app.post("/api/register", async (req, res) => {
            try {
                const registration = await accountsService.registerAccount({
                    email: readString(req.body?.email),
                    password: readString(req.body?.password),
                });
                await accountsService.flush();
                res.status(201).json(buildAuthResponse(registration.account, registration.character, null, registration.sessionToken));
            }
            catch (error) {
                respondWithApiError(res, error);
            }
        });
        app.post("/api/login", async (req, res) => {
            try {
                const login = await accountsService.loginAccount({
                    email: readString(req.body?.email),
                    password: readString(req.body?.password),
                });
                const profile = login.character
                    ? charactersService.ensureAccountCharacter(login.character.characterId, login.character.name)
                    : null;
                await accountsService.flush();
                if (profile) {
                    await charactersService.flush();
                }
                res.json(buildAuthResponse(login.account, login.character, profile, login.sessionToken));
            }
            catch (error) {
                respondWithApiError(res, error);
            }
        });
        app.post("/api/characters", async (req, res) => {
            try {
                const sessionToken = extractBearerToken(req);
                const created = await accountsService.createCharacterForSession({
                    sessionToken,
                    characterName: readString(req.body?.characterName),
                });
                const profile = created.character
                    ? charactersService.saveSiteProfile(created.character.characterId, created.character.name, {
                        tribe: readString(req.body?.tribe),
                        gender: readString(req.body?.gender),
                    })
                    : null;
                await accountsService.flush();
                await charactersService.flush();
                res.status(201).json(buildAuthResponse(created.account, created.character, profile, created.sessionToken));
            }
            catch (error) {
                respondWithApiError(res, error);
            }
        });
        app.get("/api/me", async (req, res) => {
            try {
                const sessionToken = extractBearerToken(req);
                const auth = await accountsService.requireSessionContext(sessionToken);
                const profile = auth.characterId && auth.characterName
                    ? charactersService.ensureAccountCharacter(auth.characterId, auth.characterName)
                    : null;
                res.json(buildAuthResponse({
                    accountId: auth.accountId,
                    email: auth.email,
                }, buildCharacterRecord(auth), profile, auth.sessionToken));
            }
            catch (error) {
                respondWithApiError(res, error);
            }
        });
        app.post("/api/me/appearance", async (req, res) => {
            try {
                const sessionToken = extractBearerToken(req);
                const auth = await accountsService.requireSessionContext(sessionToken);
                const currentCharacter = requireCurrentCharacter(auth);
                const profile = charactersService.saveAppearanceOnce(currentCharacter.characterId, currentCharacter.name, req.body?.appearance);
                await charactersService.flush();
                res.json(buildAuthResponse({
                    accountId: auth.accountId,
                    email: auth.email,
                }, currentCharacter, profile, auth.sessionToken));
            }
            catch (error) {
                respondWithApiError(res, error);
            }
        });
    },
});
gameServer.define(WORLD_ROOM_NAME, CatRoom);
await accountsService.load();
await charactersService.load();
await gameServer.listen(PORT);
const worldRoom = await matchMaker.createRoom(WORLD_ROOM_NAME, WORLD_ROOM_OPTIONS);
console.log(`Server running on ${PUBLIC_URL}`);
console.log(`World room "${WORLD_ROOM_NAME}" is ready (${worldRoom.roomId})`);
function readString(value) {
    return typeof value === "string" ? value : "";
}
function buildAuthResponse(account, character, profile, sessionToken) {
    return {
        ok: true,
        sessionToken,
        account: {
            accountId: account.accountId,
            email: account.email,
        },
        character: character && profile ? {
            characterId: character.characterId,
            name: character.name,
            appearanceLocked: profile.appearanceLocked,
            appearance: profile.appearance,
            skills: profile.skills,
        } : null,
        siteProfile: profile ? {
            username: profile.siteProfile.username,
            tribe: profile.siteProfile.tribe,
            gender: profile.siteProfile.gender,
        } : null,
    };
}
function buildCharacterRecord(auth) {
    if (!auth.characterId || !auth.characterName) {
        return null;
    }
    return {
        characterId: auth.characterId,
        name: auth.characterName,
    };
}
function requireCurrentCharacter(auth) {
    const currentCharacter = buildCharacterRecord(auth);
    if (!currentCharacter) {
        throw new AuthStoreError("Character must be created before this action", "CHARACTER_REQUIRED");
    }
    return currentCharacter;
}
function extractBearerToken(req) {
    const authHeader = req.header("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
        throw new AuthStoreError("Authorization token is missing", "SESSION_NOT_FOUND");
    }
    return authHeader.slice("Bearer ".length).trim();
}
function respondWithApiError(res, error) {
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
function getPlayerProfileErrorStatus(code) {
    switch (code) {
        case "APPEARANCE_LOCKED":
            return 409;
        case "INVALID_APPEARANCE":
            return 400;
        default:
            return 400;
    }
}
function getAuthErrorStatus(code) {
    switch (code) {
        case "EMAIL_TAKEN":
        case "NAME_TAKEN":
            return 409;
        case "INVALID_EMAIL":
        case "INVALID_PASSWORD":
        case "INVALID_NAME":
            return 400;
        case "CHARACTER_REQUIRED":
            return 409;
        case "AUTH_FAILED":
        case "SESSION_NOT_FOUND":
            return 401;
        case "CHARACTER_EXISTS":
            return 409;
        default:
            return 400;
    }
}
//# sourceMappingURL=index.js.map