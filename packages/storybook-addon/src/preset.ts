export const managerEntries = (entries: string[] = []) => [
  ...entries,
  decodeURIComponent(new URL("./manager.js", import.meta.url).pathname).replace(
    /^\/([A-Za-z]:\/)/,
    "$1",
  ),
];
