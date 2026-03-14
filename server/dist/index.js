import express, {} from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CatRoom } from "./rooms/CatRoom.js";
import { playerIdentityStore } from "./persistence/PlayerIdentityStore.js";
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
    },
});
gameServer.define(WORLD_ROOM_NAME, CatRoom);
await playerIdentityStore.load();
await gameServer.listen(PORT);
const worldRoom = await matchMaker.createRoom(WORLD_ROOM_NAME, WORLD_ROOM_OPTIONS);
console.log(`Server running on ${PUBLIC_URL}`);
console.log(`World room "${WORLD_ROOM_NAME}" is ready (${worldRoom.roomId})`);
//# sourceMappingURL=index.js.map