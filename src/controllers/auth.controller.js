import * as authService from "../services/auth.service.js";
import * as userRepository from "../repositories/user.repository.js";

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios." });
  }

  try {
    const result = await authService.login(email, password);
    return res.json(result);
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
}

export async function me(req, res) {
  const user = await userRepository.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado." });
  }
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}
