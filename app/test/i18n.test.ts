import { expect, it } from "vitest";
import { languageFromRequest, resolveLanguage, translate } from "../i18n";

it("defaults to the browser language and falls back to English", () => {
	expect(resolveLanguage("system", "zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
	expect(resolveLanguage("system", "en-US,en;q=0.9")).toBe("en");
	expect(resolveLanguage(undefined, null)).toBe("en");
	expect(resolveLanguage(undefined, "fr-FR")).toBe("en");
});

it("uses a saved language choice and returns to system preference", () => {
	const request = (cookie: string) =>
		new Request("http://localhost/", {
			headers: { Cookie: cookie, "Accept-Language": "zh-CN" },
		});
	expect(languageFromRequest(request("sharebox-language=en"))).toEqual({
		language: "en",
		preference: "en",
	});
	expect(languageFromRequest(request("sharebox-language=system"))).toEqual({
		language: "zh",
		preference: "system",
	});
	expect(languageFromRequest(request("sharebox-language=invalid"))).toEqual({
		language: "zh",
		preference: "system",
	});
});

it("translates interface labels and known backend errors", () => {
	expect(translate("en", "修改密码")).toBe("Change password");
	expect(translate("zh", "Incorrect current password.")).toBe("当前密码错误。");
	expect(translate("en", "Incorrect current password.")).toBe(
		"Incorrect current password.",
	);
	expect(translate("zh", "unknown error")).toBe("unknown error");
});
