import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") playerId: string = "";
  @type("string") sessionId: string = "";
  @type("string") name: string = "Cat";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") connected: boolean = true;
}

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}
