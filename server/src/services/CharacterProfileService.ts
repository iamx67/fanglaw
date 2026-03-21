import {
  PlayerIdentityStoreError,
  playerIdentityStore,
  type PlayerIdentity,
  type PlayerSiteProfileInput,
} from "../persistence/PlayerIdentityStore.js";

export { PlayerIdentityStoreError };
export type { PlayerSiteProfileInput };

export type CharacterAccountType = PlayerIdentity["accountType"];

export type CharacterWorldSnapshot = {
  characterId: string;
  name: string;
  x: number;
  y: number;
  facing: "left" | "right";
};

export type CharacterSiteProfile = {
  username: string;
  tribe: string;
  gender: string;
  bio: string;
};

export type CharacterWorldProfile = {
  x: number;
  y: number;
  facing: "left" | "right";
};

export type CharacterProfileState = {
  characterId: string;
  accountType: CharacterAccountType;
  name: string;
  siteProfile: CharacterSiteProfile;
  world: CharacterWorldProfile;
  appearanceJson: string;
  appearanceLocked: boolean;
  skillsJson: string;
  createdAt: number;
  updatedAt: number;
};

export class CharacterProfileService {
  async load() {
    await playerIdentityStore.load();
  }

  async flush() {
    await playerIdentityStore.flush();
  }

  ensureAccountCharacterProfile(characterId: string, characterName: string) {
    return toCharacterProfileState(playerIdentityStore.getOrCreateProfile(characterId, characterName, "account"));
  }

  ensureGuestCharacterProfile(characterId: string, suggestedName = "") {
    return toCharacterProfileState(playerIdentityStore.getOrCreateGuestProfile(characterId, suggestedName));
  }

  saveWorldSnapshot(snapshot: CharacterWorldSnapshot) {
    return toCharacterProfileState(playerIdentityStore.savePlayerSnapshot({
      playerId: snapshot.characterId,
      name: snapshot.name,
      x: snapshot.x,
      y: snapshot.y,
      facing: snapshot.facing,
    }));
  }

  saveSiteProfile(characterId: string, characterName: string, input: PlayerSiteProfileInput) {
    this.ensureAccountCharacterProfile(characterId, characterName);
    return toCharacterProfileState(playerIdentityStore.saveSiteProfile(characterId, input));
  }

  saveAppearanceOnce(characterId: string, characterName: string, appearance: unknown) {
    this.ensureAccountCharacterProfile(characterId, characterName);
    return toCharacterProfileState(playerIdentityStore.saveAppearanceOnce(characterId, appearance));
  }

  saveSkillProgress(characterId: string, characterName: string, skillId: string, xpDelta: number) {
    this.ensureAccountCharacterProfile(characterId, characterName);
    return toCharacterProfileState(playerIdentityStore.saveSkillProgress(characterId, skillId, xpDelta));
  }
}

export const characterProfileService = new CharacterProfileService();

function toCharacterProfileState(profile: PlayerIdentity): CharacterProfileState {
  return {
    characterId: profile.playerId,
    accountType: profile.accountType,
    name: profile.name,
    siteProfile: {
      username: profile.siteUsername,
      tribe: profile.tribe,
      gender: profile.gender,
      bio: "",
    },
    world: {
      x: profile.x,
      y: profile.y,
      facing: profile.facing,
    },
    appearanceJson: profile.appearanceJson,
    appearanceLocked: profile.appearanceLocked,
    skillsJson: profile.skillsJson,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
