import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as storeSettingsRepository from "../repositories/storeSettings.repository.js";
import * as userRepository from "../repositories/user.repository.js";

const APPROVAL_PURPOSE = "discount-approval";
const APPROVAL_TTL = "5m";

export async function getSettings() {
  const settings = await storeSettingsRepository.get();
  return { maxDiscountPercent: Number(settings.maxDiscountPercent) };
}

export async function updateSettings(data) {
  const percent = Number(data.maxDiscountPercent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("O desconto máximo precisa ser entre 0% e 100%.");
  }
  const settings = await storeSettingsRepository.update({ maxDiscountPercent: Math.round(percent * 100) / 100 });
  return { maxDiscountPercent: Number(settings.maxDiscountPercent) };
}

// Um administrador digita o próprio e-mail/senha no PDV pra liberar um desconto acima do limite.
// Devolve um token curto, que só vale pra descontos até o valor aprovado — não dá a sessão do
// administrador pro vendedor.
export async function approveDiscount({ email, password, discountAmount }) {
  const amount = Number(discountAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valor do desconto inválido.");
  }
  const user = email ? await userRepository.findByEmail(email) : null;
  if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("E-mail ou senha incorretos.");
  }
  if (user.role !== "ADMIN") {
    throw new Error("Só um administrador pode autorizar esse desconto.");
  }
  const approvalToken = jwt.sign(
    { purpose: APPROVAL_PURPOSE, approverId: user.id, maxDiscount: amount },
    process.env.JWT_SECRET,
    { expiresIn: APPROVAL_TTL },
  );
  return { approvalToken, approverName: user.name };
}

// Confere o token de aprovação na hora de gravar a venda. Devolve o id do administrador.
export function verifyDiscountApproval(approvalToken, discountAmount) {
  if (!approvalToken) return null;
  try {
    const payload = jwt.verify(approvalToken, process.env.JWT_SECRET);
    if (payload.purpose !== APPROVAL_PURPOSE) return null;
    if (discountAmount > Number(payload.maxDiscount) + 0.009) return null;
    return payload.approverId;
  } catch {
    return null;
  }
}
