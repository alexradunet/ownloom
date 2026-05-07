import type { GatewayTransport } from "../transports/types.js";
import type { Store, QueuedDelivery } from "./store.js";

type DeliveryResult = {
  recipientId: string;
  transport: string;
  queued?: boolean;
  queueId?: string;
};

function transportNameForRecipient(recipientId: string): string {
  const [prefix] = recipientId.split(":", 1);
  if (!prefix) throw new Error("Recipient id must include a transport prefix, e.g. whatsapp:+15550001111");
  if (prefix === "whatsapp-group") return "whatsapp";
  return prefix;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class DeliveryService {
  private readonly transports: Map<string, GatewayTransport>;

  constructor(transports: GatewayTransport[], private readonly store?: Store) {
    this.transports = new Map(transports.map((transport) => [transport.name, transport]));
  }

  listTransports(): string[] {
    return [...this.transports.keys()].sort();
  }

  async sendTextToRecipient(
    recipientId: string,
    text: string,
    options: { queueOnFailure?: boolean } = {},
  ): Promise<DeliveryResult> {
    const queueOnFailure = options.queueOnFailure ?? true;
    const trimmedRecipient = recipientId.trim();
    const trimmedText = text.trim();
    if (!trimmedRecipient) throw new Error("recipient must not be empty");
    if (!trimmedText) throw new Error("text must not be empty");

    const transportName = transportNameForRecipient(trimmedRecipient);
    const transport = this.transports.get(transportName);
    if (!transport) {
      throw new Error(`No gateway transport is registered for recipient '${trimmedRecipient}' (wanted '${transportName}')`);
    }

    try {
      await transport.sendTextToRecipient(trimmedRecipient, trimmedText);
      return { recipientId: trimmedRecipient, transport: transportName };
    } catch (err) {
      if (!queueOnFailure || !this.store) throw err;
      const queued = this.store.enqueueDelivery(trimmedRecipient, transportName, trimmedText, errorMessage(err));
      console.warn(`delivery: queued failed send ${queued.id} to ${trimmedRecipient}: ${queued.lastError}`);
      return { recipientId: trimmedRecipient, transport: transportName, queued: true, queueId: queued.id };
    }
  }

  async drainQueuedDeliveries(transportName?: string): Promise<{ attempted: number; delivered: number; failed: number }> {
    if (!this.store) return { attempted: 0, delivered: 0, failed: 0 };

    let attempted = 0;
    let delivered = 0;
    let failed = 0;

    for (const queued of this.store.listQueuedDeliveries(transportName)) {
      attempted += 1;
      const transport = this.transports.get(queued.transport);
      if (!transport) {
        failed += 1;
        this.store.recordQueuedDeliveryFailure(queued.id, `No transport registered for ${queued.transport}`);
        continue;
      }

      try {
        await transport.sendTextToRecipient(queued.recipientId, queued.text);
        this.store.markQueuedDeliveryDelivered(queued.id);
        delivered += 1;
      } catch (err) {
        failed += 1;
        this.store.recordQueuedDeliveryFailure(queued.id, errorMessage(err));
      }
    }

    if (attempted > 0) {
      console.log(`delivery: drained queued deliveries attempted=${attempted} delivered=${delivered} failed=${failed}`);
    }
    return { attempted, delivered, failed };
  }
}
