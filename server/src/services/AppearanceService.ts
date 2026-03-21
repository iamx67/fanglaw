import { parseStoredAppearanceJson } from "../persistence/PlayerIdentityStore.js";
import { characterProfileService, type CharacterProfileState } from "./CharacterProfileService.js";

export type CharacterAppearancePayload = ReturnType<typeof parseStoredAppearanceJson>;

export type CharacterAppearanceState = {
  appearanceJson: string;
  appearanceLocked: boolean;
  appearanceVersion: number;
  appearance: CharacterAppearancePayload;
};

export class AppearanceService {
  getAppearanceState(characterId: string, characterName: string) {
    return this.fromCharacterProfile(characterProfileService.ensureAccountCharacterProfile(characterId, characterName));
  }

  saveInitialAppearance(characterId: string, characterName: string, appearance: unknown) {
    return this.fromCharacterProfile(characterProfileService.saveAppearanceOnce(characterId, characterName, appearance));
  }

  fromCharacterProfile(profile: Pick<CharacterProfileState, "appearanceJson" | "appearanceLocked">): CharacterAppearanceState {
    return {
      appearanceJson: profile.appearanceJson,
      appearanceLocked: profile.appearanceLocked,
      appearanceVersion: 1,
      appearance: parseStoredAppearanceJson(profile.appearanceJson),
    };
  }
}

export const appearanceService = new AppearanceService();
