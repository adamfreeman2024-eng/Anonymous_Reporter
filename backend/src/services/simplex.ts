/**
 * SimpleX Bot Bridge — Zero-Trust Anonymous Reporter
 *
 * Manages a headless SimpleX Chat bot that delivers tracking-seed alerts
 * to law-enforcement agencies via self-hosted SMP relay.
 *
 * Architecture:
 *   Report submitted → Tracking Seed generated → SimpleX alert to agency contacts
 *
 * AGPLv3 notice: This service uses simplex-chat npm package UNCHANGED.
 * No modifications to the AGPLv3-licensed code are made in this project.
 */
import { T } from "@simplex-chat/types";
import { bot, api } from "simplex-chat";
import { EventEmitter } from "node:events";

// ── Types ──

export type AgencyChannel = "police" | "nss" | "anti-corruption";

export interface SimplexAlert {
  trackingSeed: string;
  destination: AgencyChannel;
  consensusTimestamp: string;
  payloadHash?: string;
}

export interface SimplexServiceConfig {
  dbPrefix: string;
}

// ── Constants ──

const AGENCY_META: Record<
  AgencyChannel,
  { emoji: string; nameArm: string }
> = {
  police: { emoji: "🚔", nameArm: "Ոստիկանություն" },
  nss: { emoji: "🔰", nameArm: "ԱԱԾ" },
  "anti-corruption": { emoji: "⚖️", nameArm: "ՀՔԾ" },
};

// ── Service ──

export class SimplexService extends EventEmitter {
  private chatApi: api.ChatApi | null = null;
  private user: T.User | null = null;
  private address: T.UserContactLink | undefined = undefined;
  private connectedContacts: Map<number, T.Contact> = new Map();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private config: SimplexServiceConfig) {
    super();
  }

  // ── Lifecycle ──

  /** Safe to call multiple times; runs only once. */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    console.log("[simplex] Initializing bot bridge...");

    const [chatApi, user, address] = await bot.run({
      profile: {
        displayName: "Anonymous Reporter Bridge",
        fullName: "ՀՀ Անանուն Հաղորդումների Համակարգ",
      },
      dbOpts: {
        type: "sqlite",
        filePrefix: this.config.dbPrefix,
      },
      options: {
        addressSettings: {
          autoAccept: true,
          welcomeMessage: {
            type: "text",
            text: "🔐 Anonymous Reporter Bridge\n\nԱյս ալիքով կստանաք անանուն հաղորդումների հետևման կոդեր:",
          },
          businessAddress: false,
        },
        allowFiles: false,
        logContacts: true,
        logNetwork: false,
      },
      events: {
        contactConnected: ({ contact }) => {
          const name = contact.profile.displayName;
          console.log(`[simplex] Contact connected: ${name} (#${contact.contactId})`);
          this.connectedContacts.set(contact.contactId, contact);
          this.emit("contact:connected", contact);
        },
        contactDeletedByContact: ({ contact }) => {
          const name = contact.profile.displayName;
          console.log(`[simplex] Contact deleted: ${name} (#${contact.contactId})`);
          this.connectedContacts.delete(contact.contactId);
          this.emit("contact:deleted", contact);
        },
      },
      onMessage: async (ci, content) => {
        const chatInfo = ci.chatInfo as T.ChatInfo;
        const name =
          chatInfo.type === "direct"
            ? (chatInfo as unknown as { contact: T.Contact }).contact.profile.displayName
            : "unknown";
        const preview = (content.text ?? "").slice(0, 100);
        console.log(`[simplex] Message from ${name}: ${preview}`);
        this.emit("message", { chatItem: ci, content });
      },
    });

    this.chatApi = chatApi;
    this.user = user;
    this.address = address;
    this.initialized = true;

    const userDisplay = user.profile.displayName;
    if (address) {
      const addrStr = `${address.connLinkContact.connFullLink.slice(0, 60)}...`;
      console.log(`[simplex] Ready — ${userDisplay} | contacts: ${this.connectedContacts.size} | addr: ${addrStr}`);
    } else {
      console.log(`[simplex] Ready — ${userDisplay} | contacts: ${this.connectedContacts.size} | no address`);
    }
  }

  // ── Send Alert ──

  async sendAlert(alert: SimplexAlert): Promise<{
    sent: boolean;
    contactName?: string;
    error?: string;
  }> {
    if (!this.initialized || !this.chatApi) {
      return { sent: false, error: "SimplexService not initialized" };
    }

    const agency = AGENCY_META[alert.destination];

    const message = [
      `${agency.emoji} ՆՈՐ ԱՆԱՆՈՒՆ ՀԱՂՈՐԴՈՒՄ`,
      `─────────────────`,
      `📌 Հետևման կոդ: ${alert.trackingSeed}`,
      `🏛️ Ուղարկված է: ${agency.nameArm}`,
      `⏱️ Consensus: ${alert.consensusTimestamp}`,
      alert.payloadHash ? `🔒 Hash: ${alert.payloadHash}` : "",
      `─────────────────`,
      `🔐 Ապահովված է SimpleX Chat-ով | Hedera Hashgraph`,
    ]
      .filter(Boolean)
      .join("\n");

    const contacts = Array.from(this.connectedContacts.values());

    if (contacts.length === 0) {
      return {
        sent: false,
        error:
          "No connected contacts — agencies must connect via SimpleX address first.",
      };
    }

    let sent = false;
    let contactName = "";
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        await this.chatApi.apiSendTextMessage(
          { chatType: T.ChatType.Direct, chatId: contact.contactId },
          message,
        );
        sent = true;
        contactName = contact.profile.displayName;
        console.log(`[simplex] Alert → ${contactName} (${alert.trackingSeed})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${contact.profile.displayName}: ${msg}`);
        console.error(`[simplex] Send failed to ${contact.profile.displayName}:`, msg);
      }
    }

    return {
      sent,
      contactName: sent ? contactName : undefined,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  }

  /** Get the bot's SimpleX contact address (share with agencies). */
  getAddress(): string | null {
    if (!this.address) return null;
    return this.address.connLinkContact.connFullLink;
  }

  /** Whether any agency contacts are connected. */
  hasContacts(): boolean {
    return this.connectedContacts.size > 0;
  }

  /** Number of connected contacts. */
  contactCount(): number {
    return this.connectedContacts.size;
  }

  /** Graceful shutdown. */
  async shutdown(): Promise<void> {
    console.log("[simplex] Shutting down...");
    this.initialized = false;
    this.chatApi = null;
    this.user = null;
    this.address = undefined;
    this.connectedContacts.clear();
  }
}

// ── Singleton ──

let instance: SimplexService | null = null;

export function getSimplexService(
  config?: SimplexServiceConfig,
): SimplexService {
  if (!instance) {
    if (!config) {
      throw new Error(
        "SimplexService not initialized — call with config first",
      );
    }
    instance = new SimplexService(config);
  }
  return instance;
}

export function hasSimplexService(): boolean {
  return instance !== null;
}