import { expect, test } from "vitest";
import { allowedTagEditorRequest } from "../packages/storybook-addon/src/tag-editor-server.ts";

test("editor accepts only same-origin loopback JSON writes", () => {
  const base = {
    method: "POST",
    host: "127.0.0.1:6006",
    origin: "http://127.0.0.1:6006",
    remoteAddress: "127.0.0.1",
    contentType: "application/json",
  };
  expect(allowedTagEditorRequest(base)).toBe(true);
  expect(allowedTagEditorRequest({ ...base, origin: "https://evil.example" })).toBe(false);
  expect(
    allowedTagEditorRequest({
      ...base,
      host: "evil.example:6006",
      origin: "http://evil.example:6006",
    }),
  ).toBe(false);
  expect(allowedTagEditorRequest({ ...base, remoteAddress: "192.168.1.20" })).toBe(false);
  expect(allowedTagEditorRequest({ ...base, contentType: "text/plain" })).toBe(false);
  expect(allowedTagEditorRequest({ ...base, origin: undefined })).toBe(false);
});
