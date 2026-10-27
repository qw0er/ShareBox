import { createContext, useContext } from "react";
import messages from "./translations.json";

export type Language = "en" | "zh";
export type LanguagePreference = Language | "system";
export const LANGUAGE_COOKIE = "sharebox-language";

export function resolveLanguage(
	preference: string | undefined,
	acceptLanguage: string | null,
): Language {
	if (preference === "en" || preference === "zh") return preference;
	const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase();
	return first?.startsWith("zh") ? "zh" : "en";
}

export function languageFromRequest(request: Request) {
	const cookie = request.headers
		.get("Cookie")
		?.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`));
	const value = cookie?.slice(LANGUAGE_COOKIE.length + 1);
	const preference: LanguagePreference =
		value === "en" || value === "zh" ? value : "system";
	return {
		preference,
		language: resolveLanguage(
			preference,
			request.headers.get("Accept-Language"),
		),
	};
}

export function translate(language: Language, text: string): string {
	if (language === "en") {
		const match = /^无法确认上传完成（HTTP (\d+)），请重试。$/.exec(text);
		if (match)
			return `Could not confirm upload completion (HTTP ${match[1]}). Please retry.`;
	}
	if (language === "en")
		return (messages.ui as Record<string, string>)[text] ?? text;
	return (
		(messages.zh_extra as Record<string, string>)[text] ??
		(messages.server as Record<string, string>)[text] ??
		text
	);
}

export const LanguageContext = createContext<{
	language: Language;
	preference: LanguagePreference;
}>({ language: "en", preference: "system" });
export function useTranslation() {
	const { language } = useContext(LanguageContext);
	return (text: string) => translate(language, text);
}
