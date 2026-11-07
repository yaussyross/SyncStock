import { Prisma, PrismaClient } from "@prisma/client";
import { syntheticShopEmail } from "./shopify-shop-account";

export class ShopRedactionOwnershipError extends Error {
  constructor() {
    super("Shop redaction requires review of account ownership");
    this.name = "ShopRedactionOwnershipError";
  }
}

export async function redactShop(db: PrismaClient, shopDomain: string, triggeredAt: Date) {
  // Resolve ownership inside the transaction. Concurrent deliveries may both
  // arrive before deletion; retry serialization conflicts with a fresh snapshot.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const email = syntheticShopEmail(shopDomain);
        const connection = await tx.shopifyConnection.findUnique({ where: { shopDomain } });
        const tombstone = await tx.shopTombstone.findUnique({ where: { shopDomain } });
        // Recover accounts left behind by the old handler, even when both
        // connection and tombstone have already been removed.
        const syntheticUser = await tx.user.findUnique({ where: { email } });
        // A retry of an older redaction must not erase a later installation (or
        // its later uninstall). Shopify supplies the original event timestamp.
        if ([connection?.installedAt, tombstone?.uninstalledAt, syntheticUser?.createdAt]
          .some((date) => date && date > triggeredAt)) {
          return false;
        }
        const userIds = [...new Set([connection?.userId, tombstone?.userId, syntheticUser?.id]
          .filter((id): id is string => Boolean(id)))];

        // Conflicting owners or a legacy standalone login are not proof that
        // all user-scoped credentials/billing/feedback belong to this shop.
        // Fail without acknowledging completion or deleting unrelated data.
        if (userIds.length > 1) throw new ShopRedactionOwnershipError();
        const userId = userIds[0];
        if (userId) {
          const user = await tx.user.findUnique({ where: { id: userId } });
          const otherConnection = await tx.shopifyConnection.findFirst({
            where: { userId, shopDomain: { not: shopDomain } },
          });
          const otherTombstone = await tx.shopTombstone.findFirst({
            where: { userId, shopDomain: { not: shopDomain } },
          });
          const otherRequest = await tx.complianceRequest.findFirst({
            where: { userId, shopDomain: { not: shopDomain } },
          });
          if ((user && user.email !== email) || otherConnection || otherTombstone || otherRequest) {
            throw new ShopRedactionOwnershipError();
          }

          // Required Prisma relations use RESTRICT (Feedback alone cascades).
          // Delete children explicitly, then the account including billing state.
          // deleteMany also succeeds when a prior cleanup removed individual rows.
          await tx.productMapping.deleteMany({ where: { userId } });
          await tx.syncLog.deleteMany({ where: { userId } });
          await tx.orderAdjustment.deleteMany({ where: { userId } });
          await tx.complianceRequest.deleteMany({ where: { userId } });
          await tx.qboConnection.deleteMany({ where: { userId } });
          await tx.accountingSettings.deleteMany({ where: { userId } });
          await tx.feedback.deleteMany({ where: { userId } });
          await tx.shopifyConnection.deleteMany({ where: { userId, shopDomain } });
          await tx.user.deleteMany({ where: { id: userId } });
        }

        // These rows can survive without a connection, tombstone owner or user.
        await tx.complianceRequest.deleteMany({ where: { shopDomain } });
        await tx.shopTombstone.deleteMany({ where: { shopDomain } });
        await tx.webhookDelivery.deleteMany({ where: { shopDomain } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
}
