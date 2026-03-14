var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Schema, type, MapSchema } from "@colyseus/schema";
export class Player extends Schema {
    constructor() {
        super(...arguments);
        this.playerId = "";
        this.sessionId = "";
        this.name = "Cat";
        this.x = 0;
        this.y = 0;
        this.connected = true;
    }
}
__decorate([
    type("string")
], Player.prototype, "playerId", void 0);
__decorate([
    type("string")
], Player.prototype, "sessionId", void 0);
__decorate([
    type("string")
], Player.prototype, "name", void 0);
__decorate([
    type("number")
], Player.prototype, "x", void 0);
__decorate([
    type("number")
], Player.prototype, "y", void 0);
__decorate([
    type("boolean")
], Player.prototype, "connected", void 0);
export class WorldState extends Schema {
    constructor() {
        super(...arguments);
        this.players = new MapSchema();
    }
}
__decorate([
    type({ map: Player })
], WorldState.prototype, "players", void 0);
//# sourceMappingURL=WorldState.js.map