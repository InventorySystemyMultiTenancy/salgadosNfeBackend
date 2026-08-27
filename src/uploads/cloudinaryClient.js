import axios from "axios";
import crypto from "node:crypto";
import FormData from "form-data";

const UPLOAD_FOLDER = "salgaderia/products";

// Upload assinado direto pra API REST do Cloudinary (sem o SDK oficial, seguindo o mesmo padrão
// enxuto usado nos clients fiscais deste projeto) — POST multipart com uma assinatura SHA1 dos
// parâmetros + api_secret, conforme https://cloudinary.com/documentation/upload_images#generating_authentication_signatures.
export async function uploadProductImage(buffer, filename, httpClient = axios) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary não configurado — preencha CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e " +
        "CLOUDINARY_API_SECRET no .env do backend.",
    );
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { folder: UPLOAD_FOLDER, timestamp };
  const signature = signParams(paramsToSign, apiSecret);

  const form = new FormData();
  form.append("file", buffer, filename);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("folder", UPLOAD_FOLDER);
  form.append("signature", signature);

  try {
    const { data } = await httpClient.post(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      form,
      { headers: form.getHeaders() },
    );
    return data.secure_url;
  } catch (error) {
    throw new Error(describeCloudinaryError(error));
  }
}

// Assinatura = SHA1(parâmetros ordenados alfabeticamente como "chave=valor&chave2=valor2" + api_secret).
function signParams(params, apiSecret) {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(paramString + apiSecret).digest("hex");
}

function describeCloudinaryError(error) {
  const data = error.response?.data;
  if (!data) {
    return `Falha ao conectar com o Cloudinary: ${error.message}`;
  }
  return data.error?.message || JSON.stringify(data);
}
