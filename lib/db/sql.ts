import "server-only";

export const sql = (strings: TemplateStringsArray, ...values: Array<string | number>) => {
  const rendered = strings.reduce((acc, segment, index) => {
    const value = values[index];
    return `${acc}${segment}${value === undefined ? "" : String(value)}`;
  }, "");

  return rendered
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};
