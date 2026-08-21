import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getFrontendUrl } from "../config.js";

const original = process.env.FRONTEND_URL;

afterEach(() => {
  process.env.FRONTEND_URL = original;
});

describe("getFrontendUrl", () => {
  it("usa localhost por padrão quando a variável não está definida", () => {
    delete process.env.FRONTEND_URL;
    expect(getFrontendUrl()).toBe("http://localhost:5173");
  });

  it("adiciona https:// quando falta o esquema", () => {
    process.env.FRONTEND_URL = "salgadosnfe.selfmachine.com.br";
    expect(getFrontendUrl()).toBe("https://salgadosnfe.selfmachine.com.br");
  });

  it("mantém o esquema quando já está presente", () => {
    process.env.FRONTEND_URL = "http://salgadosnfe.selfmachine.com.br";
    expect(getFrontendUrl()).toBe("http://salgadosnfe.selfmachine.com.br");
  });

  it("remove a barra final", () => {
    process.env.FRONTEND_URL = "https://salgadosnfe.selfmachine.com.br/";
    expect(getFrontendUrl()).toBe("https://salgadosnfe.selfmachine.com.br");
  });
});
