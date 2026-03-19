import { createTranslator } from "@/lib/i18n/translate";

type Translator = ReturnType<typeof createTranslator>;

const commonSystemAdminApiMessageKeyMap: Record<string, string> = {
  "กรุณาเข้าสู่ระบบ": "systemAdmin.api.loginRequired",
  "เฉพาะผู้ดูแลระบบกลางเท่านั้น": "systemAdmin.api.forbidden",
  "เกิดข้อผิดพลาดภายในระบบ": "systemAdmin.api.internalError",
};

export const translateSystemAdminApiMessage = ({
  message,
  t,
  fallbackKey,
  overrides,
}: {
  message?: string | null;
  t: Translator;
  fallbackKey: string;
  overrides?: Record<string, string>;
}) => {
  const translatedKey =
    (message ? overrides?.[message] : undefined) ??
    (message ? commonSystemAdminApiMessageKeyMap[message] : undefined) ??
    fallbackKey;

  return t(translatedKey);
};
