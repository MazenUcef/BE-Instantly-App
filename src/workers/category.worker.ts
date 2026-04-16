import { getChannel } from "../shared/config/rabbitmq";
import prisma from "../shared/config/prisma";
import { UserRole } from "@prisma/client";
import { publishNotification } from "../modules/notification/notification.publisher";

export const startCategoryWorker = async () => {
  const channel = getChannel();

  await channel.assertQueue("CATEGORY_CREATED", { durable: true });

  channel.consume("CATEGORY_CREATED", async (msg) => {
    if (!msg) return;

    const payload = JSON.parse(msg.content.toString());

    try {
      const { categoryId, name, jobs } = payload;

      const customers = await prisma.user.findMany({
        where: { role: UserRole.customer },
        select: { id: true },
      });

      await Promise.all(
        customers.map((customer) =>
          publishNotification({
            userId: customer.id,
            type: "NEW_CATEGORY_CREATED",
            title: "New Category Available 🎉",
            message: `A new category "${name}" is now available.`,
            data: { categoryId, jobs },
          }),
        ),
      );

      channel.ack(msg);
    } catch (err) {
      console.error("Category worker error:", err);
      channel.nack(msg, false, true);
    }
  });

  console.log("✅ Category worker started...");
};
