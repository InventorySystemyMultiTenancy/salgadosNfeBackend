import * as userService from "../services/user.service.js";

export async function list(req, res) {
  const users = await userService.listUsers();
  return res.json(users);
}

export async function create(req, res) {
  try {
    const user = await userService.createUser(req.body);
    return res.status(201).json(user);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
