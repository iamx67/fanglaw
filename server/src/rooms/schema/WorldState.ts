import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") playerId: string = "";
  @type("string") sessionId: string = "";
  @type("string") name: string = "Cat";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") facing: string = "right";
  @type("string") appearanceJson: string = "";
  @type("number") stamina: number = 100;
  @type("boolean") sprinting: boolean = false;
  @type("boolean") connected: boolean = true;
}

export class Prey extends Schema {
  @type("string") preyId: string = "";
  @type("string") kind: string = "mouse";
  @type("string") state: string = "alive";
  @type("string") searchZoneId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class WorldState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Prey }) prey = new MapSchema<Prey>();
}
