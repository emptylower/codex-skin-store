import type { PackageQueue, PackageQueueMessage } from "~/platform/ports";

/**
 * PACKAGE_QUEUE producer. Message body is { jobId, idempotencyKey }.
 */
export function createPackageQueue(
  queue: Queue<PackageQueueMessage>,
): PackageQueue {
  return {
    async send(message: PackageQueueMessage): Promise<void> {
      await queue.send(message);
    },
  };
}
