import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as authService from "../auth.service.js";
import * as userRepository from "../../repositories/user.repository.js";

vi.mock("../../repositories/user.repository.js");
vi.mock("bcryptjs");
vi.mock("jsonwebtoken");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("auth.service.login", () => {
  it("rejeita usuário inexistente", async () => {
    userRepository.findByEmail.mockResolvedValue(null);
    await expect(authService.login("nao@existe.com", "123")).rejects.toThrow("Credenciais inválidas.");
  });

  it("rejeita senha incorreta", async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 1, passwordHash: "hash" });
    bcrypt.compare.mockResolvedValue(false);
    await expect(authService.login("admin@salgaderia.com", "errada")).rejects.toThrow("Credenciais inválidas.");
  });

  it("retorna token e usuário em caso de sucesso", async () => {
    userRepository.findByEmail.mockResolvedValue({
      id: 1,
      name: "Admin",
      email: "admin@salgaderia.com",
      role: "ADMIN",
      passwordHash: "hash",
    });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("fake-token");

    const result = await authService.login("admin@salgaderia.com", "admin123");

    expect(result.token).toBe("fake-token");
    expect(result.user).toEqual({ id: 1, name: "Admin", email: "admin@salgaderia.com", role: "ADMIN" });
  });
});
