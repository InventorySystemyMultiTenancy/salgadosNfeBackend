import bcrypt from "bcryptjs";
import * as userRepository from "../repositories/user.repository.js";

const ROLES = ["ADMIN", "SELLER", "KITCHEN"];

export function listUsers() {
  return userRepository.findAll();
}

export async function createUser({ name, email, password, role }) {
  if (!name || !email || !password) {
    throw new Error("Nome, email e senha são obrigatórios.");
  }
  if (!ROLES.includes(role)) {
    throw new Error("Perfil inválido.");
  }

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new Error("Já existe um usuário com este email.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userRepository.create({ name, email, passwordHash, role });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
