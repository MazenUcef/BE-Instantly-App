import prisma from "./prisma";

const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log("PostgreSQL connected (Prisma)");
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
