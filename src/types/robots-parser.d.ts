declare module "robots-parser" {
  export type RobotsParser = {
    isAllowed(url: string, userAgent?: string): boolean | undefined;
  };

  export default function robotsParser(url: string, contents: string): RobotsParser;
}
