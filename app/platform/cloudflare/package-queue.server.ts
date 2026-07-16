import type { PackageQueue, PackageQueueMessage } from "~/platform/ports";

/**
 * PACKAGE_QUEUE producer. Message body is { jobId, idempotencyKey }.
 */
export function createPackageQueue(
  queue: Queue<PackageQueueMessage>,
): PackageQueue {
  return {
    async send(
      message: PackageQueueMessage,
      options?: { delaySeconds?: number },
    ): Promise<void> {
      if (options?.delaySeconds != null && options.delaySeconds > 0) {
        await queue.send(message, { delaySeconds: options.delaySeconds });
        return;
      }
      await queue.send(message);
    },
  };
}
