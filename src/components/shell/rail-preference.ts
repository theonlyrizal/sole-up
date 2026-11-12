export const RAIL_STORAGE_KEY = "soleup.rail";

/** Apply the saved layout before styles paint, including on a cold reload. */
export function railInitScript(): string {
  return `try {
    if (localStorage.getItem(${JSON.stringify(RAIL_STORAGE_KEY)}) === "collapsed") {
      document.documentElement.dataset.rail = "collapsed";
    }
  } catch {}`;
}
