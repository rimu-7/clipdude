const CREDIT_CARD_RE =
  /\b(?:\d[ -]*?){13,19}\b/g;

const API_KEY_PATTERNS = [
  /(?:sk|pk)_(?:test|live|proj)_[a-zA-Z0-9]{20,}/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/g,
  /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
  /(?:xox[bpsoa])-[a-zA-Z0-9-]{10,}/g,
  /[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64}/g,
];

const PASSWORD_MANAGERS = [
  "com.1password.1password",
  "com.agilebits.onepassword-osx",
  "com.bitwarden.desktop",
  "com.apple.keychainaccess",
  "org.keepassxc.keepassxc",
  "com.lastpass.lastpassmacdesktop",
];

export function detectSensitiveData(text: string): {
  isSensitive: boolean;
  maskedContent: string;
  detections: string[];
} {
  const detections: string[] = [];
  let masked = text;

  if (CREDIT_CARD_RE.test(text)) {
    detections.push("credit_card");
    masked = text.replace(
      /\b(\d[ -]*?){13,19}\b/g,
      (match) => {
        const digits = match.replace(/\D/g, "");
        if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
          const last4 = digits.slice(-4);
          return `**** **** **** ${last4}`;
        }
        return match;
      }
    );
  }

  CREDIT_CARD_RE.lastIndex = 0;

  for (const pattern of API_KEY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detections.push("api_key");
      masked = masked.replace(pattern, (match) => {
        if (match.length > 8) {
          return match.slice(0, 4) + "****" + match.slice(-4);
        }
        return "****";
      });
    }
    pattern.lastIndex = 0;
  }

  return {
    isSensitive: detections.length > 0,
    maskedContent: masked,
    detections,
  };
}

function luhnCheck(num: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function isPasswordManager(bundleId: string): boolean {
  return PASSWORD_MANAGERS.some((pm) =>
    bundleId.toLowerCase().includes(pm.toLowerCase())
  );
}

export function isExcludedApp(
  bundleId: string,
  excludedApps: string[]
): boolean {
  return excludedApps.some(
    (excluded) =>
      bundleId.toLowerCase().includes(excluded.toLowerCase()) ||
      excluded.toLowerCase().includes(bundleId.toLowerCase())
  );
}
