import {
  characterProfileService,
  PlayerIdentityStoreError,
  type CharacterProfileState,
  type CharacterWorldSnapshot,
  type PlayerSiteProfileInput,
} from "./CharacterProfileService.js";
import { appearanceService, type CharacterAppearancePayload } from "./AppearanceService.js";
import { progressionService, type CharacterSkillsPayload } from "./ProgressionService.js";

export { PlayerIdentityStoreError };
export type { CharacterWorldSnapshot, PlayerSiteProfileInput };

export type CharacterState = CharacterProfileState & {
  appearanceVersion: number;
  appearance: CharacterAppearancePayload;
  skills: CharacterSkillsPayload;
};

export class CharactersService {
  async load() {
    await characterProfileService.load();
  }

  async flush() {
    await characterProfileService.flush();
  }

  ensureAccountCharacter(characterId: string, characterName: string) {
    return this.compose(characterProfileService.ensureAccountCharacterProfile(characterId, characterName));
  }

  ensureGuestCharacter(characterId: string, suggestedName = "") {
    return this.compose(characterProfileService.ensureGuestCharacterProfile(characterId, suggestedName));
  }

  saveWorldSnapshot(snapshot: CharacterWorldSnapshot) {
    return this.compose(characterProfileService.saveWorldSnapshot(snapshot));
  }

  saveSiteProfile(characterId: string, characterName: string, input: PlayerSiteProfileInput) {
    return this.compose(characterProfileService.saveSiteProfile(characterId, characterName, input));
  }

  saveAppearanceOnce(characterId: string, characterName: string, appearance: unknown) {
    return this.compose(characterProfileService.saveAppearanceOnce(characterId, characterName, appearance));
  }

  addSkillXp(characterId: string, characterName: string, skillId: string, xpDelta: number) {
    return this.compose(characterProfileService.saveSkillProgress(characterId, characterName, skillId, xpDelta));
  }

  private compose(profile: CharacterProfileState): CharacterState {
    const appearance = appearanceService.fromCharacterProfile(profile);
    const progression = progressionService.fromCharacterProfile(profile);

    return {
      ...profile,
      appearanceVersion: appearance.appearanceVersion,
      appearance: appearance.appearance,
      skills: progression.skills,
    };
  }
}

export const charactersService = new CharactersService();
