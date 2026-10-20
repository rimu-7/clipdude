use std::borrow::Cow;
use std::sync::LazyLock;

use regex::Regex;

/// Patterns for credentials that are unambiguous enough to flag without false alarms
/// on ordinary text such as commit hashes or UUIDs.
static SECRET_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        r"\b(?:sk|pk|rk)_(?:test|live)_[A-Za-z0-9]{16,}",
        r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}",
        r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}",
        r"\bgithub_pat_[A-Za-z0-9_]{40,}",
        r"\bglpat-[A-Za-z0-9_-]{20,}",
        r"\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b",
        r"\bAIza[0-9A-Za-z_-]{35}",
        r"\bxox[abposr]-[A-Za-z0-9-]{10,}",
        r"\bnpm_[A-Za-z0-9]{36}\b",
        r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    ]
    .iter()
    .map(|pattern| Regex::new(pattern).expect("secret pattern is valid"))
    .collect()
});

static CARD_NUMBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b\d(?:[ -]?\d){12,18}\b").expect("card pattern is valid"));

pub fn is_sensitive(text: &str) -> bool {
    SECRET_PATTERNS.iter().any(|re| re.is_match(text))
        || CARD_NUMBER
            .find_iter(text)
            .any(|m| is_card_number(m.as_str()))
}

/// Hides the secret parts of `text` for display, keeping a few characters for recognition.
pub fn mask(text: &str) -> String {
    let mut masked: Cow<str> = CARD_NUMBER.replace_all(text, |caps: &regex::Captures| {
        let found = &caps[0];
        if is_card_number(found) {
            let digits: String = found.chars().filter(char::is_ascii_digit).collect();
            format!("•••• •••• •••• {}", &digits[digits.len() - 4..])
        } else {
            found.to_string()
        }
    });
    for re in SECRET_PATTERNS.iter() {
        if re.is_match(&masked) {
            masked = Cow::Owned(
                re.replace_all(&masked, |caps: &regex::Captures| {
                    let found = &caps[0];
                    if found.len() > 12 && !found.starts_with("-----") {
                        format!("{}••••{}", &found[..4], &found[found.len() - 4..])
                    } else {
                        "••••••••".to_string()
                    }
                })
                .into_owned(),
            );
        }
    }
    masked.into_owned()
}

fn is_card_number(candidate: &str) -> bool {
    let digits: Vec<u32> = candidate.chars().filter_map(|c| c.to_digit(10)).collect();
    if !(13..=19).contains(&digits.len()) {
        return false;
    }
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| match i % 2 {
            0 => d,
            _ if d * 2 > 9 => d * 2 - 9,
            _ => d * 2,
        })
        .sum();
    sum.is_multiple_of(10)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_cards_only_when_luhn_valid() {
        assert!(is_sensitive("card 4111 1111 1111 1111 exp"));
        assert!(!is_sensitive("order 4111 1111 1111 1112"));
        assert_eq!(mask("pay 4111-1111-1111-1111"), "pay •••• •••• •••• 1111");
    }

    #[test]
    fn flags_api_keys_but_not_hashes() {
        assert!(is_sensitive("ghp_abcdefghijklmnopqrstuvwxyz0123456789"));
        assert!(is_sensitive("AKIAABCDEFGHIJKLMNOP"));
        assert!(!is_sensitive("e83c5163316f89bfbde7d9ab23ca2e25604af290"));
        assert_eq!(
            mask("key=ghp_abcdefghijklmnopqrstuvwxyz0123456789"),
            "key=ghp_••••6789"
        );
    }
}
