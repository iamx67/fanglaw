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
        this.facing = "right";
        this.appearanceJson = "";
        this.skillsJson = "";
        this.stamina = 100;
        this.sprinting = false;
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
    type("string")
], Player.prototype, "facing", void 0);
__decorate([
    type("string")
], Player.prototype, "appearanceJson", void 0);
__decorate([
    type("string")
], Player.prototype, "skillsJson", void 0);
__decorate([
    type("number")
], Player.prototype, "stamina", void 0);
__decorate([
    type("boolean")
], Player.prototype, "sprinting", void 0);
__decorate([
    type("boolean")
], Player.prototype, "connected", void 0);
export class Prey extends Schema {
    constructor() {
        super(...arguments);
        this.preyId = "";
        this.kind = "mouse";
        this.visualId = "";
        this.behaviorType = "runner";
        this.state = "alive";
        this.watching = false;
        this.searchZoneId = "";
        this.x = 0;
        this.y = 0;
    }
}
__decorate([
    type("string")
], Prey.prototype, "preyId", void 0);
__decorate([
    type("string")
], Prey.prototype, "kind", void 0);
__decorate([
    type("string")
], Prey.prototype, "visualId", void 0);
__decorate([
    type("string")
], Prey.prototype, "behaviorType", void 0);
__decorate([
    type("string")
], Prey.prototype, "state", void 0);
__decorate([
    type("boolean")
], Prey.prototype, "watching", void 0);
__decorate([
    type("string")
], Prey.prototype, "searchZoneId", void 0);
__decorate([
    type("number")
], Prey.prototype, "x", void 0);
__decorate([
    type("number")
], Prey.prototype, "y", void 0);
export class WorldState extends Schema {
    constructor() {
        super(...arguments);
        this.players = new MapSchema();
        this.prey = new MapSchema();
    }
}
__decorate([
    type({ map: Player })
], WorldState.prototype, "players", void 0);
__decorate([
    type({ map: Prey })
], WorldState.prototype, "prey", void 0);
//# sourceMappingURL=WorldState.js.map