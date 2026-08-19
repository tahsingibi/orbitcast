import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { signRequest } from "../src/lib/storage/sigv4.ts";

/**
 * AWS'in resmî Signature Version 4 test paketinden alınan vakalar.
 *
 * İmzalama sessizce yanlış olabilen türden bir iş: tek bir sıralama ya da
 * kodlama hatasında sunucu yalnızca "SignatureDoesNotMatch" der, nedenini
 * söylemez. Bu yüzden doğruluk kendi hesabımıza değil, AWS'in yayımladığı
 * beklenen çıktılara bağlanıyor.
 *
 * Vakalar bilinçli seçildi: sorgu sıralaması (anahtara ve değere göre), başlık
 * sıralaması, başlık değerlerindeki fazla boşluk, UTF-8 sorgu ve kodlanmaması
 * gereken karakterler. Kimlik bilgileri AWS'in örnek anahtarları.
 */

const ACCESS_KEY = "AKIDEXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

/** "20150830T123600Z" -> Date */
function parseAmzDate(value: string): Date {
  const iso = value.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
    "$1-$2-$3T$4:$5:$6Z",
  );
  return new Date(iso);
}

const vectors: {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  date: string;
  authz: string;
}[] = [
  {
    name: "get-vanilla",
    method: "GET",
    url: "https://example.amazonaws.com/",
    headers: {},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
  },
  {
    name: "get-vanilla-query-order-key-case",
    method: "GET",
    url: "https://example.amazonaws.com/?Param2=value2&Param1=value1",
    headers: {},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500",
  },
  {
    name: "get-vanilla-query-order-value",
    method: "GET",
    url: "https://example.amazonaws.com/?Param1=value2&Param1=value1",
    headers: {},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5772eed61e12b33fae39ee5e7012498b51d56abc0abb7c60486157bd471c4694",
  },
  {
    name: "get-header-value-trim",
    method: "GET",
    url: "https://example.amazonaws.com/",
    headers: {"My-Header1":"value1","My-Header2":"\"a   b   c\""},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;my-header1;my-header2;x-amz-date, Signature=acc3ed3afb60bb290fc8d2dd0098b9911fcaa05412b367055dee359757a9c736",
  },
  {
    name: "get-vanilla-utf8-query",
    method: "GET",
    url: "https://example.amazonaws.com/?ሴ=bar",
    headers: {},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=2cdec8eed098649ff3a119c94853b13c643bcf08f8b0a1d91e12c9027818dd04",
  },
  {
    name: "get-unreserved",
    method: "GET",
    url: "https://example.amazonaws.com/-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    headers: {},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=07ef7494c76fa4850883e2b006601f940f8a34d404d0cfa977f52a65bbf5f24f",
  },
  {
    name: "post-vanilla-query",
    method: "POST",
    url: "https://example.amazonaws.com/?Param1=value1",
    headers: {},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=28038455d6de14eafc1f9222cf5aa6f1a96197d7deb8263271d420d138af7f11",
  },
  {
    name: "post-header-key-sort",
    method: "POST",
    url: "https://example.amazonaws.com/",
    headers: {"My-Header1":"value1"},
    body: "",
    date: "20150830T123600Z",
    authz:
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;my-header1;x-amz-date, Signature=c5410059b04c1ee005303aed430f6e6645f61f4dc9e1461ec8f8916fdf18852c",
  },
];

describe("sigv4 · AWS resmî test vektörleri", () => {
  for (const vector of vectors) {
    it(vector.name, () => {
      const headers = signRequest({
        method: vector.method,
        url: new URL(vector.url),
        headers: vector.headers,
        body: new TextEncoder().encode(vector.body),
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET_KEY,
        region: "us-east-1",
        service: "service",
        now: parseAmzDate(vector.date),
      });

      assert.equal(headers.Authorization, vector.authz);
    });
  }
});
