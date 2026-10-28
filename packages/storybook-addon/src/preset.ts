import type { Indexer } from "storybook/internal/types";
import { wrapIndexers } from "./story-index.ts";

export const experimental_indexers = (indexers: Indexer[] = []) => wrapIndexers(indexers);

export const managerEntries = (entries: string[] = []) => [
  ...entries,
  decodeURIComponent(new URL("./manager.js", import.meta.url).pathname).replace(
    /^\/([A-Za-z]:\/)/,
    "$1",
  ),
];
