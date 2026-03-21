import {
  AuthStoreError,
  authStore,
  type AuthCreateCharacterInput,
  type AuthContextData,
  type AuthLoginInput,
  type AuthMutationResult,
  type AuthRegistrationInput,
} from "../persistence/AuthStore.js";

export { AuthStoreError };
export type { AuthContextData, AuthLoginInput, AuthRegistrationInput };

export type AccountRecord = {
  accountId: string;
  email: string;
};

export type CharacterRecord = {
  characterId: string;
  name: string;
};

export type GameAuthContextData = AuthContextData & {
  characterId: string;
  characterName: string;
};

export type AuthenticatedAccountResult = {
  account: AccountRecord;
  character: CharacterRecord | null;
  sessionToken: string;
};

export class AccountsService {
  async load() {
    await authStore.load();
  }

  async flush() {
    await authStore.flush();
  }

  async registerAccount(input: AuthRegistrationInput): Promise<AuthenticatedAccountResult> {
    return toAuthenticatedAccountResult(await authStore.register(input));
  }

  async loginAccount(input: AuthLoginInput): Promise<AuthenticatedAccountResult> {
    return toAuthenticatedAccountResult(await authStore.login(input));
  }

  async createCharacterForSession(input: AuthCreateCharacterInput): Promise<AuthenticatedAccountResult> {
    return toAuthenticatedAccountResult(await authStore.createCharacter(input));
  }

  async requireSessionContext(sessionToken: string): Promise<AuthContextData> {
    return await authStore.getAuthBySessionToken(sessionToken);
  }

  async requireGameSessionContext(sessionToken: string): Promise<GameAuthContextData> {
    const context = await this.requireSessionContext(sessionToken);
    if (!context.characterId || !context.characterName) {
      throw new AuthStoreError("Character must be created before entering the game", "CHARACTER_REQUIRED");
    }

    return {
      ...context,
      characterId: context.characterId,
      characterName: context.characterName,
    };
  }
}

export const accountsService = new AccountsService();

function toAuthenticatedAccountResult(result: AuthMutationResult): AuthenticatedAccountResult {
  return {
    account: {
      accountId: result.account.accountId,
      email: result.account.email,
    },
    character: result.character ? {
      characterId: result.character.characterId,
      name: result.character.name,
    } : null,
    sessionToken: result.session.token,
  };
}
