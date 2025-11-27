import axios from "axios";
import Fuse from "fuse.js";

interface MFScheme {
  schemeCode: string;
  schemeName: string;
}

interface NavData {
  date: string;
  nav: string;
}

export class NavService {
  private static schemeCache: MFScheme[] | null = null;
  private static fuse: Fuse<MFScheme> | null = null;

  /**
   * Fetch the master list of all mutual funds
   */
  private async getSchemeList(): Promise<MFScheme[]> {
    if (NavService.schemeCache) return NavService.schemeCache;

    try {
      console.log("[NavService] Fetching scheme list from mfapi.in...");
      console.log(`[NavService] Requesting scheme list from https://api.mfapi.in/mf`);
      const response = await axios.get("https://api.mfapi.in/mf");
      console.log(`[NavService] Received ${Array.isArray(response.data) ? response.data.length : 0} schemes`);
      NavService.schemeCache = response.data as MFScheme[];
      
      // Initialize Fuse.js for fuzzy matching
      NavService.fuse = new Fuse(NavService.schemeCache!, {
        keys: ["schemeName"],
        includeScore: true,
        threshold: 0.4, // Match tolerance (0.0 = exact, 1.0 = anything)
      });

      console.log(`[NavService] Cached ${NavService.schemeCache?.length} schemes.`);
      return NavService.schemeCache!;
    } catch (error) {
      console.error("[NavService] Failed to fetch scheme list:", error);
      return [];
    }
  }

  /**
   * Find the closest matching scheme code for a given fund name
   */
  async findSchemeCode(fundName: string): Promise<string | null> {
    await this.getSchemeList();

    if (!NavService.fuse) return null;

    const results = NavService.fuse.search(fundName);
    if (results.length > 0) {
      const bestMatch = results[0];
      console.log(`[NavService] Matched '${fundName}' to '${bestMatch.item.schemeName}' (Score: ${bestMatch.score})`);
      return bestMatch.item.schemeCode;
    }

    console.warn(`[NavService] No match found for '${fundName}'`);
    return null;
  }

  /**
   * Fetch historical NAV data for a scheme
   */
  async getNavHistory(schemeCode: string): Promise<NavData[]> {
    try {
      console.log(`[NavService] Requesting NAV history for scheme ${schemeCode} from https://api.mfapi.in/mf/${schemeCode}`);
      const response = await axios.get(`https://api.mfapi.in/mf/${schemeCode}`);
      // Cast response.data to any to access nested data property safely, then cast to NavData[]
      const data = (response.data as any).data;
      if (data && Array.isArray(data)) {
        console.log(`[NavService] Received ${data.length} NAV entries for scheme ${schemeCode}`);
        return data as NavData[];
      }
      console.warn(`[NavService] No NAV data returned for scheme ${schemeCode}`);
      return [];
    } catch (error) {
      console.error(`[NavService] Failed to fetch NAV for ${schemeCode}:`, error);
      return [];
    }
  }

  /**
   * Get the latest NAV
   */
  async getLatestNav(schemeCode: string): Promise<number | null> {
    const history = await this.getNavHistory(schemeCode);
    if (history.length > 0) {
      return parseFloat(history[0].nav);
    }
    return null;
  }
}
