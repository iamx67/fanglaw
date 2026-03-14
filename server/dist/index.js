import express, {} from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CatRoom } from "./rooms/CatRoom.js";
const PORT = Number(process.env.PORT ?? 2567);
const gameServer = new Server({
    transport: new WebSocketTransport(),
    express: (app) => {
        app.use(express.json());
        app.get("/", (_req, res) => {
            res.json({
                ok: true,
                room: "cats",
                transport: "ws",
                matchmaking: "/matchmake/joinOrCreate/cats",
            });
        });
    },
});
gameServer.define("cats", CatRoom);
await gameServer.listen(PORT);
console.log(`Server running on http://localhost:${PORT}`);
console.log('Room handler "cats" is registered');
//# sourceMappingURL=index.js.map