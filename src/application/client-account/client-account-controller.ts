import type {
  ApiClientAccount,
  ApiClientAddress,
} from '../../../shared/api-contracts';
import type { AuthSession } from '../auth/session-controller';
import type { BookingAddress } from '../booking/booking-contracts';
import type {
  ClientAccount,
  ClientAddressInput,
  ClientOnboardingDraft,
  ClientPreferredLanguage,
} from './client-account-contracts';

export interface ClientAccountCache {
  read(userId: string): Promise<ClientAccount | null>;
  write(userId: string, account: ClientAccount): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface ClientAccountGateway {
  load(token: string): Promise<ApiClientAccount | null>;
  completeOnboarding(token: string, input: {
    fullName: string;
    phoneNumber: string | null;
    preferredLanguage: ClientPreferredLanguage;
    address?: ClientAddressInput;
  }): Promise<ApiClientAccount>;
  createAddress(token: string, address: ClientAddressInput): Promise<ApiClientAddress>;
  updateAddress(token: string, addressId: string, address: ClientAddressInput): Promise<ApiClientAddress>;
  deleteAddress(token: string, addressId: string): Promise<void>;
  setDefaultAddress(token: string, addressId: string): Promise<void>;
  updateProfile(token: string, profile: ClientAccount['profile']): Promise<void>;
  deleteAccount(token: string): Promise<void>;
}

export interface ClientAccountRuntime {
  now(): number;
  createAddressId(): string;
  travelFeeFor(zone: string): number;
}

export interface ClientAccountControllerLogger {
  error(message: string, error: unknown): void;
}

export type ClientAccountLoadStatus = 'loading' | 'ready' | 'error';

export interface ClientAccountSnapshot {
  account: ClientAccount | null;
  draft: ClientOnboardingDraft;
  language: ClientPreferredLanguage;
  loadStatus: ClientAccountLoadStatus;
}

type ClientAccountListener = () => void;

const silentLogger: ClientAccountControllerLogger = {
  error() {},
};

function createDraft(
  session: AuthSession | null,
  preferredLanguage: ClientPreferredLanguage,
): ClientOnboardingDraft {
  return {
    fullName: session?.displayName ?? '',
    email: session?.email ?? '',
    phoneNumber: session?.phoneNumber ?? '',
    preferredLanguage,
  };
}

function addressFromApi(address: ApiClientAddress): BookingAddress {
  return {
    id: address.id,
    label: address.label,
    zone: address.zone,
    detail: address.detail,
    fee: address.fee,
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
  };
}

export class ClientAccountController {
  private snapshot: ClientAccountSnapshot;
  private readonly listeners = new Set<ClientAccountListener>();
  private readonly cache: ClientAccountCache;
  private readonly gateway: ClientAccountGateway;
  private readonly runtime: ClientAccountRuntime;
  private readonly logger: ClientAccountControllerLogger;
  private session: AuthSession | null = null;
  private userId = 'anonymous';
  private identity = '';
  private loadVersion = 0;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    cache: ClientAccountCache,
    gateway: ClientAccountGateway,
    runtime: ClientAccountRuntime,
    initialLanguage: ClientPreferredLanguage,
    logger: ClientAccountControllerLogger = silentLogger,
  ) {
    this.cache = cache;
    this.gateway = gateway;
    this.runtime = runtime;
    this.logger = logger;
    this.snapshot = {
      account: null,
      draft: createDraft(null, initialLanguage),
      language: initialLanguage,
      loadStatus: 'loading',
    };
  }

  readonly getSnapshot = (): ClientAccountSnapshot => this.snapshot;

  readonly subscribe = (listener: ClientAccountListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async setSession(session: AuthSession | null): Promise<void> {
    const identity = session
      ? `${session.source}:${session.userId}:${session.accessToken ?? ''}`
      : 'anonymous';
    this.session = session;
    if (identity === this.identity) return;

    this.identity = identity;
    this.session = session;
    this.userId = session?.userId ?? 'anonymous';
    const loadVersion = ++this.loadVersion;
    this.publish({
      account: null,
      draft: createDraft(session, this.snapshot.language),
      language: this.snapshot.language,
      loadStatus: 'loading',
    });

    let account: ClientAccount | null = null;
    try {
      account = await this.cache.read(this.userId);
      if (!this.isCurrentLoad(loadVersion, identity)) return;
      if (account) this.publishAccount(account, 'loading');
    } catch (error) {
      this.logger.error('Unable to restore the cached client account.', error);
    }

    if (session?.source === 'api' && session.accessToken) {
      try {
        const remote = await this.gateway.load(session.accessToken);
        if (!this.isCurrentLoad(loadVersion, identity)) return;
        account = remote ? this.accountFromApi(remote) : null;
        if (account) this.publishAccount(account, 'loading');
        else this.publish({ ...this.snapshot, account: null });
        try {
          if (account) await this.cache.write(this.userId, account);
          else await this.cache.delete(this.userId);
        } catch (error) {
          this.logger.error('Unable to cache the client account.', error);
        }
      } catch (error) {
        this.logger.error('Unable to refresh the client account.', error);
        if (this.isCurrentLoad(loadVersion, identity)) this.publish({ ...this.snapshot, loadStatus: 'error' });
        return;
      }
    }

    if (!this.isCurrentLoad(loadVersion, identity)) return;
    if (!account) {
      this.publish({
        account: null,
        draft: createDraft(session, this.snapshot.language),
        language: this.snapshot.language,
        loadStatus: 'ready',
      });
      return;
    }
    this.publishAccount(account, 'ready');
  }

  retryLoad(): Promise<void> {
    this.identity = '';
    return this.setSession(this.session);
  }

  setLanguage(language: ClientPreferredLanguage): void {
    if (this.snapshot.account) return;
    if (
      this.snapshot.language === language &&
      this.snapshot.draft.preferredLanguage === language
    ) return;
    this.publish({
      ...this.snapshot,
      language,
      draft: { ...this.snapshot.draft, preferredLanguage: language },
    });
  }

  updateDraft(changes: Partial<ClientOnboardingDraft>): void {
    const draft = { ...this.snapshot.draft, ...changes };
    this.publish({
      ...this.snapshot,
      draft,
      language: changes.preferredLanguage ?? this.snapshot.language,
    });
  }

  completeOnboarding(address?: ClientAddressInput): Promise<void> {
    return this.enqueueMutation(async () => {
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      const draft = this.snapshot.draft;
      const language = this.snapshot.language;
      let account: ClientAccount;

      if (session?.source === 'api' && session.accessToken) {
        account = this.accountFromApi(await this.gateway.completeOnboarding(session.accessToken, {
          fullName: draft.fullName.trim(),
          phoneNumber: draft.phoneNumber.trim() || null,
          preferredLanguage: language,
          ...(address ? { address } : {}),
        }));
      } else {
        const firstAddress: BookingAddress | null = address ? {
          ...address,
          id: this.runtime.createAddressId(),
          fee: this.runtime.travelFeeFor(address.zone),
        } : null;
        account = {
          profile: {
            fullName: draft.fullName.trim(),
            email: draft.email.trim().toLowerCase() || null,
            phoneNumber: draft.phoneNumber.trim() || null,
            preferredLanguage: language,
          },
          addresses: firstAddress ? [firstAddress] : [],
          defaultAddressId: firstAddress?.id ?? null,
          completedAt: this.runtime.now(),
        };
      }
      await this.persist(account, userId, loadVersion);
    });
  }

  addAddress(address: ClientAddressInput): Promise<string> {
    let createdAddressId = '';
    return this.enqueueMutation(async () => {
      const account = this.requireAccount('add an address');
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      const nextAddress = session?.source === 'api' && session.accessToken
        ? addressFromApi(await this.gateway.createAddress(session.accessToken, address))
        : {
            ...address,
            id: this.runtime.createAddressId(),
            fee: this.runtime.travelFeeFor(address.zone),
          };
      createdAddressId = nextAddress.id;
      await this.persist({
        ...account,
        addresses: [...account.addresses, nextAddress],
        defaultAddressId: account.defaultAddressId ?? nextAddress.id,
      }, userId, loadVersion);
    }).then(() => createdAddressId);
  }

  updateAddress(addressId: string, address: ClientAddressInput): Promise<void> {
    return this.enqueueMutation(async () => {
      const account = this.snapshot.account;
      if (!account) return;
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      const remoteAddress = session?.source === 'api' && session.accessToken
        ? addressFromApi(await this.gateway.updateAddress(session.accessToken, addressId, address))
        : null;
      const addresses = account.addresses.map((item) => item.id === addressId
        ? remoteAddress ?? {
            ...address,
            id: addressId,
            fee: this.runtime.travelFeeFor(address.zone),
          }
        : item);
      await this.persist({ ...account, addresses }, userId, loadVersion);
    });
  }

  removeAddress(addressId: string): Promise<void> {
    return this.enqueueMutation(async () => {
      const account = this.snapshot.account;
      if (!account) return;
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      if (session?.source === 'api' && session.accessToken) {
        await this.gateway.deleteAddress(session.accessToken, addressId);
      }
      const addresses = account.addresses.filter((item) => item.id !== addressId);
      await this.persist({
        ...account,
        addresses,
        defaultAddressId: account.defaultAddressId === addressId
          ? addresses[0]?.id ?? null
          : account.defaultAddressId,
      }, userId, loadVersion);
    });
  }

  setDefaultAddress(addressId: string): Promise<void> {
    return this.enqueueMutation(async () => {
      const account = this.snapshot.account;
      if (!account || !account.addresses.some((item) => item.id === addressId)) return;
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      if (session?.source === 'api' && session.accessToken) {
        await this.gateway.setDefaultAddress(session.accessToken, addressId);
      }
      await this.persist({ ...account, defaultAddressId: addressId }, userId, loadVersion);
    });
  }

  updateProfile(changes: Partial<ClientAccount['profile']>): Promise<void> {
    return this.enqueueMutation(async () => {
      const account = this.snapshot.account;
      if (!account) return;
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      const profile = { ...account.profile, ...changes };
      if (session?.source === 'api' && session.accessToken) {
        await this.gateway.updateProfile(session.accessToken, profile);
      }
      await this.persist({ ...account, profile }, userId, loadVersion);
    });
  }

  deleteAccount(): Promise<void> {
    return this.enqueueMutation(async () => {
      const session = this.session;
      const userId = this.userId;
      const loadVersion = this.loadVersion;
      if (session?.source === 'api' && session.accessToken) {
        await this.gateway.deleteAccount(session.accessToken);
      }
      await this.cache.delete(userId);
      if (loadVersion === this.loadVersion && userId === this.userId) {
        this.publish({ ...this.snapshot, account: null });
      }
    });
  }

  private accountFromApi(account: ApiClientAccount): ClientAccount {
    const completedAt = Date.parse(account.completedAt);
    return {
      profile: account.profile,
      addresses: account.addresses.map(addressFromApi),
      defaultAddressId: account.defaultAddressId,
      completedAt: Number.isNaN(completedAt) ? this.runtime.now() : completedAt,
    };
  }

  private requireAccount(operation: string): ClientAccount {
    if (!this.snapshot.account) {
      throw new Error(`A client account is required to ${operation}.`);
    }
    return this.snapshot.account;
  }

  private async persist(account: ClientAccount, userId: string, loadVersion: number): Promise<void> {
    try { await this.cache.write(userId, account); }
    catch (error) { this.logger.error('Unable to cache the saved client account.', error); }
    if (loadVersion !== this.loadVersion || userId !== this.userId) return;
    this.publishAccount(account, 'ready');
  }

  private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const identity = this.identity;
    const guardedMutation = () => {
      if (identity !== this.identity) {
        throw new Error('The active client account changed before the operation completed.');
      }
      return mutation();
    };
    const pending = this.mutationQueue.then(guardedMutation, guardedMutation);
    this.mutationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private isCurrentLoad(loadVersion: number, identity: string): boolean {
    return loadVersion === this.loadVersion && identity === this.identity;
  }

  private publishAccount(account: ClientAccount, loadStatus: ClientAccountLoadStatus): void {
    this.publish({
      account,
      draft: this.snapshot.draft,
      language: account.profile.preferredLanguage,
      loadStatus,
    });
  }

  private publish(snapshot: ClientAccountSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
