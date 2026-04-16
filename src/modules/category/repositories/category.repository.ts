import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

export interface ISessionWorkflowDef {
  key: string;
  label: string;
  steps: string[];
}

export class CategoryRepository {
  static findActive(tx?: Tx) {
    return (tx ?? prisma).category.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: { workflows: true },
    });
  }

  static findAll(tx?: Tx) {
    return (tx ?? prisma).category.findMany({
      orderBy: { createdAt: "desc" },
      include: { workflows: true },
    });
  }

  static findById(categoryId: string, tx?: Tx) {
    return (tx ?? prisma).category.findUnique({
      where: { id: categoryId },
      include: { workflows: true },
    });
  }

  static findByNormalizedName(normalizedName: string, tx?: Tx) {
    return (tx ?? prisma).category.findUnique({
      where: { normalizedName },
      include: { workflows: true },
    });
  }

  static create(
    data: {
      name: string;
      normalizedName: string;
      description?: string | null;
      image?: string | null;
      jobs: string[];
      workflows: ISessionWorkflowDef[];
      isActive?: boolean;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).category.create({
      data: {
        name: data.name,
        normalizedName: data.normalizedName,
        description: data.description ?? null,
        image: data.image ?? null,
        jobs: data.jobs ?? [],
        isActive: data.isActive ?? true,
        workflows: {
          create: (data.workflows ?? []).map((w) => ({
            key: w.key,
            label: w.label,
            steps: w.steps,
          })),
        },
      },
      include: { workflows: true },
    });
  }

  static async updateById(
    categoryId: string,
    updates: {
      name?: string;
      normalizedName?: string;
      description?: string | null;
      image?: string | null;
      jobs?: string[];
      isActive?: boolean;
      workflows?: ISessionWorkflowDef[];
    },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const { workflows, ...rest } = updates;

    if (workflows) {
      await client.categoryWorkflow.deleteMany({
        where: { categoryId },
      });
      return client.category.update({
        where: { id: categoryId },
        data: {
          ...rest,
          workflows: {
            create: workflows.map((w) => ({
              key: w.key,
              label: w.label,
              steps: w.steps,
            })),
          },
        },
        include: { workflows: true },
      });
    }

    return client.category.update({
      where: { id: categoryId },
      data: rest,
      include: { workflows: true },
    });
  }
}
