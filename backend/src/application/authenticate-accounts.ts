import type { ApiUser } from '../../../shared/api-contracts.ts';
import type {
  AccountAuthenticationStore,
  Clock,
  IdGenerator,
  PasswordSecurity,
} from './ports.ts';

export class AccountAuthenticator {
  private readonly store: AccountAuthenticationStore;
  private readonly passwords: PasswordSecurity;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly developmentAdmin: { enabled: boolean; email: string; password: string };

  constructor(
    store: AccountAuthenticationStore,
    passwords: PasswordSecurity,
    ids: IdGenerator,
    clock: Clock,
    developmentAdmin: { enabled: boolean; email: string; password: string },
  ) {
    this.store = store;
    this.passwords = passwords;
    this.ids = ids;
    this.clock = clock;
    this.developmentAdmin = developmentAdmin;
  }

  async registerClient(email: string, fullName: string, password: string): Promise<ApiUser> {
    return this.store.createClient({
      userId: this.ids.next(),
      email,
      fullName,
      passwordHash: await this.passwords.hash(password),
      createdAt: this.clock.now().toISOString(),
    });
  }

  async loginClient(email: string, password: string): Promise<ApiUser | null> {
    const credentials = this.store.findClientCredentials(email);
    if (!credentials) {
      await this.passwords.hash(password);
      return null;
    }
    return await this.passwords.verify(password, credentials.passwordHash)
      ? credentials.user
      : null;
  }

  async loginAdmin(email: string, password: string): Promise<ApiUser | null> {
    let credentials = this.store.findAdminCredentials(email);
    if (
      !credentials &&
      this.developmentAdmin.enabled &&
      email === this.developmentAdmin.email &&
      password === this.developmentAdmin.password
    ) {
      this.store.createAdministrator({
        administratorId: this.ids.next(),
        email,
        fullName: 'Konjo administrator',
        passwordHash: await this.passwords.hash(password),
        createdAt: this.clock.now().toISOString(),
      });
      credentials = this.store.findAdminCredentials(email);
    }
    if (!credentials) {
      await this.passwords.hash(password);
      return null;
    }
    return await this.passwords.verify(password, credentials.passwordHash)
      ? credentials.user
      : null;
  }
}
