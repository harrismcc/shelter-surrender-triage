import type { Config } from "./config";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const IMMUTABLE_ID_PREFER = 'IdType="ImmutableId"';
const MESSAGE_PREFER = `${IMMUTABLE_ID_PREFER}, outlook.body-content-type="text"`;

export interface GraphMessage {
  id: string;
  parentFolderId: string;
  subject?: string | null;
  from?: {
    emailAddress?: {
      address?: string | null;
    } | null;
  } | null;
  body?: {
    content?: string | null;
  } | null;
  categories?: string[];
  receivedDateTime?: string;
}

export interface MailFolder {
  id: string;
  displayName: string;
}

export interface MasterCategory {
  id?: string;
  displayName: string;
  color: string;
}

export interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  lifecycleNotificationUrl?: string;
  expirationDateTime: string;
}

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly stage: string,
  ) {
    super(`Microsoft Graph request failed at ${stage} (${status})`);
  }
}

export interface GraphOperations {
  getInboxId(): Promise<string>;
  findMailFolderId(displayName: string): Promise<string | null>;
  getMessage(messageId: string): Promise<GraphMessage | null>;
  updateMessageCategories(messageId: string, categories: string[]): Promise<void>;
  moveMessage(messageId: string, destinationFolderId: string): Promise<void>;
}

export interface ProvisioningGraphOperations {
  listMailFolders(): Promise<MailFolder[]>;
  createMailFolder(displayName: string): Promise<MailFolder>;
  listMasterCategories(): Promise<MasterCategory[]>;
  createMasterCategory(displayName: string, color: string): Promise<void>;
  updateMasterCategoryColor(id: string, color: string): Promise<void>;
  listSubscriptions(): Promise<GraphSubscription[]>;
  createSubscription(subscription: Omit<GraphSubscription, "id"> & { clientState: string }): Promise<void>;
  renewSubscription(id: string, expirationDateTime: string): Promise<void>;
  deleteSubscription(id: string): Promise<void>;
}

export class GraphClient implements GraphOperations {
  private accessToken?: { value: string; expiresAt: number };
  private refreshToken?: string;
  private readonly fetcher: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>;
  private readonly mailboxPath: string;

  constructor(
    private readonly config: Config,
    fetcher: typeof fetch = fetch,
  ) {
    this.fetcher = (input, init) => fetcher(input, init);
    this.mailboxPath = config.microsoftAuthMode === "delegated"
      ? "/me"
      : `/users/${encodeURIComponent(config.mailbox ?? "")}`;
    this.refreshToken = config.microsoftRefreshToken;
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }

    const url = `https://login.microsoftonline.com/${encodeURIComponent(this.config.microsoftTenantId)}/oauth2/v2.0/token`;
    const tokenBody = this.config.microsoftAuthMode === "delegated"
      ? new URLSearchParams({
          client_id: this.config.microsoftClientId,
          refresh_token: this.refreshToken ?? "",
          scope:
            "offline_access https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/MailboxSettings.ReadWrite",
          grant_type: "refresh_token",
        })
      : new URLSearchParams({
          client_id: this.config.microsoftClientId,
          client_secret: this.config.microsoftClientSecret ?? "",
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tokenBody,
        });
      } catch {
        if (attempt === 2) throw new GraphError(0, "authentication");
        await sleep(100 * 2 ** attempt);
        continue;
      }
      if (response.ok) {
        const data = (await response.json()) as {
          access_token?: string;
          expires_in?: number;
          refresh_token?: string;
        };
        if (!data.access_token) throw new GraphError(502, "authentication-response");
        if (data.refresh_token) this.refreshToken = data.refresh_token;
        this.accessToken = {
          value: data.access_token,
          expiresAt: Date.now() + (data.expires_in ?? 3_600) * 1_000,
        };
        return data.access_token;
      }
      if (!(response.status === 429 || response.status >= 500) || attempt === 2) {
        throw new GraphError(response.status, "authentication");
      }
      await sleep(100 * 2 ** attempt);
    }
    throw new GraphError(0, "authentication");
  }

  private async request<T>(
    method: string,
    pathOrUrl: string,
    stage: string,
    options: { body?: unknown; prefer?: string; notFoundIsNull?: boolean } = {},
  ): Promise<T | null> {
    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_ROOT}${pathOrUrl}`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const headers = new Headers({ Authorization: `Bearer ${await this.token()}` });
      if (options.prefer) headers.set("Prefer", options.prefer);
      if (options.body !== undefined) headers.set("Content-Type", "application/json");

      let response: Response;
      try {
        response = await this.fetcher(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
      } catch {
        if (attempt === 2) throw new GraphError(0, stage);
        await sleep(100 * 2 ** attempt);
        continue;
      }

      lastStatus = response.status;
      if (response.status === 404 && options.notFoundIsNull) return null;
      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }
      if (!(response.status === 429 || response.status >= 500) || attempt === 2) {
        throw new GraphError(response.status, stage);
      }
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
      await sleep(
        Number.isFinite(retryAfter)
          ? Math.min(retryAfter * 1_000, 5_000)
          : 100 * 2 ** attempt,
      );
    }
    throw new GraphError(lastStatus, stage);
  }

  private async listCollection<T>(
    path: string,
    stage: string,
    prefer?: string,
  ): Promise<T[]> {
    let next: string | undefined = `${GRAPH_ROOT}${path}`;
    const items: T[] = [];
    while (next) {
      const page: GraphCollection<T> | null = await this.request("GET", next, stage, { prefer });
      if (!page) break;
      items.push(...page.value);
      next = page["@odata.nextLink"];
    }
    return items;
  }

  async getInboxId(): Promise<string> {
    const folder = await this.request<MailFolder>(
      "GET",
      `${this.mailboxPath}/mailFolders/inbox?$select=id`,
      "get-inbox",
      { prefer: IMMUTABLE_ID_PREFER },
    );
    if (!folder) throw new GraphError(404, "get-inbox");
    return folder.id;
  }

  async getMessage(messageId: string): Promise<GraphMessage | null> {
    return this.request<GraphMessage>(
      "GET",
      `${this.mailboxPath}/messages/${encodeURIComponent(messageId)}?$select=id,parentFolderId,subject,from,body,categories`,
      "get-message",
      { prefer: MESSAGE_PREFER, notFoundIsNull: true },
    );
  }

  async updateMessageCategories(messageId: string, categories: string[]): Promise<void> {
    await this.request(
      "PATCH",
      `${this.mailboxPath}/messages/${encodeURIComponent(messageId)}`,
      "update-categories",
      { body: { categories }, prefer: IMMUTABLE_ID_PREFER },
    );
  }

  async moveMessage(messageId: string, destinationFolderId: string): Promise<void> {
    await this.request(
      "POST",
      `${this.mailboxPath}/messages/${encodeURIComponent(messageId)}/move`,
      "move-message",
      { body: { destinationId: destinationFolderId }, prefer: IMMUTABLE_ID_PREFER },
    );
  }

  async listRecentInboxMessages(since: Date, maximum: number): Promise<GraphMessage[]> {
    const query = new URLSearchParams({
      "$select": "id,subject,from,receivedDateTime",
      "$filter": `receivedDateTime ge ${since.toISOString()}`,
      "$orderby": "receivedDateTime desc",
      "$top": String(Math.min(maximum, 100)),
    });
    let next: string | undefined = `${GRAPH_ROOT}${this.mailboxPath}/mailFolders/inbox/messages?${query}`;
    const messages: GraphMessage[] = [];
    while (next && messages.length < maximum) {
      const page: GraphCollection<GraphMessage> | null = await this.request(
        "GET",
        next,
        "reconcile-inbox",
        { prefer: IMMUTABLE_ID_PREFER },
      );
      if (!page) break;
      messages.push(...page.value.slice(0, maximum - messages.length));
      next = page["@odata.nextLink"];
    }
    return messages;
  }

  async listMailFolders(): Promise<MailFolder[]> {
    return this.listCollection<MailFolder>(
      `${this.mailboxPath}/mailFolders?$select=id,displayName&$top=100`,
      "list-folders",
      IMMUTABLE_ID_PREFER,
    );
  }

  async findMailFolderId(displayName: string): Promise<string | null> {
    const normalizedName = displayName.trim().toLocaleLowerCase("en-US");
    return (
      (await this.listMailFolders()).find(
        (folder) => folder.displayName.trim().toLocaleLowerCase("en-US") === normalizedName,
      )?.id ?? null
    );
  }

  async createMailFolder(displayName: string): Promise<MailFolder> {
    const folder = await this.request<MailFolder>(
      "POST",
      `${this.mailboxPath}/mailFolders`,
      "create-folder",
      { body: { displayName }, prefer: IMMUTABLE_ID_PREFER },
    );
    if (!folder) throw new GraphError(502, "create-folder-response");
    return folder;
  }

  async listMasterCategories(): Promise<MasterCategory[]> {
    return this.listCollection<MasterCategory>(
      `${this.mailboxPath}/outlook/masterCategories?$select=id,displayName,color&$top=100`,
      "list-master-categories",
    );
  }

  async createMasterCategory(displayName: string, color: string): Promise<void> {
    await this.request(
      "POST",
      `${this.mailboxPath}/outlook/masterCategories`,
      "create-master-category",
      { body: { displayName, color } },
    );
  }

  async updateMasterCategoryColor(id: string, color: string): Promise<void> {
    await this.request(
      "PATCH",
      `${this.mailboxPath}/outlook/masterCategories/${encodeURIComponent(id)}`,
      "update-master-category",
      { body: { color } },
    );
  }

  async listSubscriptions(): Promise<GraphSubscription[]> {
    return this.listCollection<GraphSubscription>("/subscriptions", "list-subscriptions");
  }

  async createSubscription(subscription: Omit<GraphSubscription, "id"> & { clientState: string }): Promise<void> {
    await this.request("POST", "/subscriptions", "create-subscription", {
      body: { ...subscription, latestSupportedTlsVersion: "v1_2" },
      prefer: IMMUTABLE_ID_PREFER,
    });
  }

  async renewSubscription(id: string, expirationDateTime: string): Promise<void> {
    await this.request("PATCH", `/subscriptions/${encodeURIComponent(id)}`, "renew-subscription", {
      body: { expirationDateTime },
      prefer: IMMUTABLE_ID_PREFER,
    });
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.request(
      "DELETE",
      `/subscriptions/${encodeURIComponent(id)}`,
      "delete-subscription",
    );
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
