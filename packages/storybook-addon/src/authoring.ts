/** Optional Storybook-specific CLI adapter. Ordinary CLI consumers do not load this module. */
export const adapterVersion = 1;
export { getComponentTags, previewComponentTags, saveComponentTags } from "./tag-storage.ts";
