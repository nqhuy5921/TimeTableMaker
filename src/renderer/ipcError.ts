/** An error from the main process in words for the user. Errors from `invoke` arrive as
    "Error invoking remote method '…': Error: …", so that prefix is dropped. */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
}
