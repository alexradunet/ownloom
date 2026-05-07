import type { GatewayTransport } from "../transports/types.js";

type DeliveryResult = {
  recipientId: string;
  transport: string;
};

function transportNameForRecipient(recipientId: string): string {
  const [prefix] = recipientId.split(":", 1);
  if (!prefix) throw new Error("Recipient id must include a transport prefix, e.g. whatsapp:+15550001111");
  if (prefix === "whatsapp-group") return "whatsapp";
  return prefix;
}

export class DeliveryService {
  private readonly transports: Map<string, GatewayTransport>;

  constructor(transports: GatewayTransport[]) {
    this.transports = new Map(transports.map((transport) => [transport.name, transport]));
  }

  listTransports(): string[] {
    return [...this.transports.keys()].sort();
  }

  async sendTextToRecipient(recipientId: string, text: string): Promise<DeliveryResult> {
    const trimmedRecipient = recipientId.trim();
    const trimmedText = text.trim();
    if (!trimmedRecipient) throw new Error("recipient must not be empty");
    if (!trimmedText) throw new Error("text must not be empty");

    const transportName = transportNameForRecipient(trimmedRecipient);
    const transport = this.transports.get(transportName);
    if (!transport) {
      throw new Error(`No gateway transport is registered for recipient '${trimmedRecipient}' (wanted '${transportName}')`);
    }

    await transport.sendTextToRecipient(trimmedRecipient, trimmedText);
    return { recipientId: trimmedRecipient, transport: transportName };
  }
}
