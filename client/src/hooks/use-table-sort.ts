import { useCallback, useState } from "react";

export function useTableSort<K extends string>(
  defaultKey: K,
  defaultDir: "asc" | "desc" = "asc",
) {
  const [sortKey, setSortKey] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);

  const toggleSort = useCallback((key: K) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  return { sortKey, sortDir, toggleSort, setSortKey, setSortDir };
}
