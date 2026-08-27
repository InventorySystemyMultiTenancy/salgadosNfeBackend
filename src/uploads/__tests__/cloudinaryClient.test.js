import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { uploadProductImage } from "../cloudinaryClient.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
  process.env.CLOUDINARY_API_KEY = "demo-key";
  process.env.CLOUDINARY_API_SECRET = "demo-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("cloudinaryClient.uploadProductImage", () => {
  it("rejeita sem credenciais configuradas", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    await expect(uploadProductImage(Buffer.from("x"), "foto.png")).rejects.toThrow(
      "Cloudinary não configurado",
    );
  });

  it("envia multipart pro endpoint certo, com assinatura SHA1 válida", async () => {
    const post = vi.fn().mockResolvedValue({ data: { secure_url: "https://res.cloudinary.com/x.png" } });

    const url = await uploadProductImage(Buffer.from("conteudo"), "foto.png", { post });

    expect(post).toHaveBeenCalledTimes(1);
    const [calledUrl, form, config] = post.mock.calls[0];
    expect(calledUrl).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
    expect(config.headers).toBeDefined();

    // Reconstrói a assinatura esperada a partir dos campos que o form-data realmente serializa,
    // pra garantir que a fórmula (SHA1 de "folder=...&timestamp=..." + api_secret) bate.
    const raw = form.getBuffer().toString("utf-8");
    const timestampMatch = raw.match(/name="timestamp"\r\n\r\n(\d+)/);
    const signatureMatch = raw.match(/name="signature"\r\n\r\n([0-9a-f]{40})/);
    expect(timestampMatch).not.toBeNull();
    expect(signatureMatch).not.toBeNull();

    const expectedSignature = crypto
      .createHash("sha1")
      .update(`folder=salgaderia/products&timestamp=${timestampMatch[1]}demo-secret`)
      .digest("hex");
    expect(signatureMatch[1]).toBe(expectedSignature);
    expect(raw).toContain('name="api_key"\r\n\r\ndemo-key');
    expect(raw).toContain('name="folder"\r\n\r\nsalgaderia/products');

    expect(url).toBe("https://res.cloudinary.com/x.png");
  });

  it("propaga a mensagem de erro do Cloudinary quando a API rejeita", async () => {
    const post = vi.fn().mockRejectedValue({ response: { data: { error: { message: "Invalid signature" } } } });

    await expect(uploadProductImage(Buffer.from("x"), "foto.png", { post })).rejects.toThrow(
      "Invalid signature",
    );
  });
});
