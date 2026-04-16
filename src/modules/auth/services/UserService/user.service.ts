import { UserRepository } from "../../repositories/user.repository";
import { AppError } from "../../../../shared/middlewares/errorHandler";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidId = (id: string) => UUID_RE.test(id);

const sanitizeUser = (user: any) => {
  const { password, governments, ...rest } = user;
  return {
    ...rest,
    governmentIds: Array.isArray(governments)
      ? governments.map((g: any) => g.governmentId)
      : [],
  };
};

export class UserService {
  static async getAllUsers() {
    const users = await UserRepository.listUsers();
    return {
      count: users.length,
      data: users.map((u) => sanitizeUser(u)),
    };
  }

  static async getUserById(id: string) {
    if (!isValidId(id)) throw new AppError("Invalid user ID", 400);

    const user = await UserRepository.findById(id);
    if (!user) throw new AppError("User not found", 404);

    return { data: sanitizeUser(user) };
  }

  static async updateUser(id: string, payload: Record<string, any>) {
    if (!isValidId(id)) throw new AppError("Invalid user ID", 400);

    const allowedFields = [
      "firstName",
      "lastName",
      "address",
      "profilePicture",
      "phoneNumber",
    ];

    const updates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (payload[key] !== undefined) updates[key] = payload[key];
    }

    const user = await UserRepository.updateById(id, updates);
    if (!user) throw new AppError("User not found", 404);

    return { message: "User updated successfully", data: sanitizeUser(user) };
  }

  static async deleteUser(id: string) {
    if (!isValidId(id)) throw new AppError("Invalid user ID", 400);

    const user = await UserRepository.deleteById(id);
    if (!user) throw new AppError("User not found", 404);

    return { message: "User deleted successfully" };
  }
}
