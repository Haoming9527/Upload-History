import type { Message, Reply } from './types';

export async function request<T>(message: Message): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as Reply<T> | undefined;
  if (!response?.ok)
    throw new Error(response?.error || 'The extension could not complete this action. Try again.');
  return response.data as T;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
