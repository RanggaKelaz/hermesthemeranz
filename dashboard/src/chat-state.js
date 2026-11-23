export function orderSessionMessages(response) {
  const messages = Array.isArray(response?.messages) ? response.messages : [];
  const order = response?.pagination?.order ?? response?.order;
  return order === "latest" ? messages.slice().reverse() : messages.slice();
}

export function sessionMessageIdentity(message) {
  if (typeof message?.message_uid === "string" && message.message_uid) {
    return message.message_uid;
  }
  if (typeof message?.id === "string" && message.id) return `id:${message.id}`;
  if (typeof message?.id === "number" && Number.isFinite(message.id)) return `id:${message.id}`;
  return null;
}

export function reconcilePendingMessages(pending, messages) {
  const matchedIds = new Set();
  return pending.filter((item) => {
    const seenIds = new Set(item.seenIds ?? []);
    const match = messages.find((message) => {
      if (message?.role !== "user") return false;
      const id = sessionMessageIdentity(message);
      if (!id || seenIds.has(id) || matchedIds.has(id)) return false;
      matchedIds.add(id);
      return true;
    });
    return !match;
  });
}

export function explicitProgress(payload) {
  const percent = payload && typeof payload === "object" ? payload.percent : null;
  return typeof percent === "number" && Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? percent
    : null;
}
