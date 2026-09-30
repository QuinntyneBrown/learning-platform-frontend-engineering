export interface SseMessage {
  event: string;
  data: string;
  id?: string;
}

/**
 * Parses as much of a text/event-stream buffer as is complete. Network chunks can end anywhere,
 * even mid-line, so whatever follows the last blank line comes back as `rest`, and the caller
 * prepends it to the next chunk. Pure, so it can be tested without a network.
 */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? '';
  const messages: SseMessage[] = [];

  for (const block of blocks) {
    const message: SseMessage = { event: 'message', data: '' };
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line === '' || line.startsWith(':')) continue; // ":" starts a comment (keep-alive)
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') data.push(value);
      else if (field === 'event') message.event = value;
      else if (field === 'id') message.id = value;
    }
    // A block with no data (only a comment, say) dispatches nothing.
    if (data.length > 0) messages.push({ ...message, data: data.join('\n') });
  }

  return { messages, rest };
}
