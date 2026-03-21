import { parseStoredSkillsJson } from "../persistence/PlayerIdentityStore.js";
import { characterProfileService, type CharacterProfileState } from "./CharacterProfileService.js";

export type CharacterSkillsPayload = ReturnType<typeof parseStoredSkillsJson>;

export type CharacterProgressionState = {
  skillsJson: string;
  skills: CharacterSkillsPayload;
};

export class ProgressionService {
  getProgressionState(characterId: string, characterName: string) {
    return this.fromCharacterProfile(characterProfileService.ensureAccountCharacterProfile(characterId, characterName));
  }

  addSkillXp(characterId: string, characterName: string, skillId: string, xpDelta: number) {
    return this.fromCharacterProfile(
      characterProfileService.saveSkillProgress(characterId, characterName, skillId, xpDelta),
    );
  }

  fromCharacterProfile(profile: Pick<CharacterProfileState, "skillsJson">): CharacterProgressionState {
    return {
      skillsJson: profile.skillsJson,
      skills: parseStoredSkillsJson(profile.skillsJson),
    };
  }
}

export const progressionService = new ProgressionService();
