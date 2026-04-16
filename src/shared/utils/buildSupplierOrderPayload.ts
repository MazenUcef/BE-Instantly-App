import prisma from "../config/prisma";

export const buildSupplierOrderPayload = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      government: {
        select: {
          id: true,
          name: true,
          nameAr: true,
          country: true,
          isActive: true,
        },
      },
      category: {
        select: { id: true, name: true, description: true, jobs: true },
      },
    },
  });

  if (!order) return null;

  const customer = await prisma.user.findUnique({
    where: { id: order.customerId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      profilePicture: true,
      address: true,
      averageRating: true,
      totalReviews: true,
    },
  });

  const { category, government, ...rest } = order;
  const { jobs: _jobs, ...categoryWithoutJobs } = category || ({ jobs: [] } as any);

  return {
    ...rest,
    customer: customer || null,
    government: government || null,
    category: categoryWithoutJobs || null,
  };
};
