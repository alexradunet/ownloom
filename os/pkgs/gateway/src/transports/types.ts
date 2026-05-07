import type { InboundMessage } from "../core/types.js";

/** Every transport module implements this interface. */
export interface GatewayTransport {
  readonly name: string;
  healthCheck(): Promise<void>;
  /**
   * Start receiving inbound messages. Never resolves.
   *
   * @param onMessage  Called for each inbound message.  The optional `onChunk`
   *                   argument lets the transport receive streaming text fragments
   *                   as they are generated.  Transports that do not support
   *                   streaming (e.g. WhatsApp) simply omit `onChunk`; the full
   *                   reply is delivered via `sendText` instead.
   */
  startReceiving(
    onMessage: (msg: InboundMessage, onChunk?: (chunk: string) => void) => Promise<void>,
  ): Promise<never>;
  sendText(message: InboundMessage, text: string): Promise<void>;
  sendTextToRecipient(recipientId: string, text: string): Promise<void>;
}
